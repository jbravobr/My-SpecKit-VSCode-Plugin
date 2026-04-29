#!/usr/bin/env python3
"""Validate SpecKit story markdown files and emit concise validation reports."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Sequence

Severity = Literal["error", "warning"]

RE_METADATA = re.compile(r"<!--\s*metadata\s*([\s\S]*?)-->", re.IGNORECASE)
RE_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
RE_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
RE_BULLET = re.compile(r"^\s*-\s+(.+?)\s*$")
RE_CHECKBOX = re.compile(r"^\s*-\s+\[(?P<mark>[ xX])]\s+(?P<text>.+?)\s*$")
RE_STORY_ID = re.compile(r"^[A-Z]{2}-[A-Z0-9]+-\d{8}-\d{4}$")

CANONICAL_H2 = [
    "Requisito de Negócio",
    "Especificação Funcional",
    "Especificação Não-Funcional",
    "Especificação Técnica",
    "DoR - Definition of Ready",
    "DoD - Definition of Done",
]

CANONICAL_H3: dict[str, list[str]] = {
    "Requisito de Negócio": ["Problema", "Valor", "Stakeholders"],
    "Especificação Funcional": ["User Stories", "Critérios de Aceite", "Fora de Escopo"],
    "Especificação Não-Funcional": [
        "Performance",
        "Segurança",
        "Escalabilidade",
        "Usabilidade",
        "Disponibilidade",
    ],
    "Especificação Técnica": [
        "Linguagem",
        "Framework",
        "Arquitetura",
        "Target",
        "Banco de Dados",
        "Infraestrutura",
        "Estágio do Projeto",
        "CI",
    ],
}
CANONICAL_H3_TITLES = {title for titles in CANONICAL_H3.values() for title in titles}

REQUIRED_METADATA = ["id", "title", "createdAt", "version", "type", "status", "gate"]
VALID_STATUSES = {"open", "in-progress", "review", "blocked", "done", "cancelled"}
VALID_GATES = {"0", "1", "2", "3", "4"}
VALID_LANGUAGES = {
    "typescript",
    "javascript",
    "java",
    "kotlin",
    "csharp",
    "python",
    "go",
    "rust",
    "php",
    "ruby",
    "scala",
    "swift",
    "unknown",
}
VALID_FRAMEWORKS = {
    "dotnet",
    "springboot",
    "quarkus",
    "micronaut",
    "angular",
    "react",
    "vue",
    "svelte",
    "next",
    "nuxt",
    "nestjs",
    "express",
    "fastify",
    "fastapi",
    "django",
    "flask",
    "rails",
    "laravel",
    "gin",
    "actix",
    "rocket",
    "vapor",
    "android",
    "gradle",
    "other",
}
VALID_ARCHITECTURES = {"hexagonal", "layered", "microservices", "monolith", "serverless"}
VALID_TARGETS = {"backend", "frontend", "bff", "script", "library"}
VALID_PROJECT_STAGES = {"greenfield", "brownfield"}
VALID_CI = {"github-actions", "none"}
VAGUE_TERMS = ("etc", "rápido", "adequado", "melhorar", "otimizar", "simples", "robusto")


@dataclass(frozen=True)
class Heading:
    level: int
    title: str
    normalized: str
    line: int


@dataclass(frozen=True)
class Issue:
    severity: Severity
    code: str
    location: str
    message: str

    def to_dict(self) -> dict[str, str]:
        return {
            "severity": self.severity,
            "code": self.code,
            "location": self.location,
            "message": self.message,
        }


@dataclass(frozen=True)
class Section:
    title: str
    line: int
    body: str
    subsections: dict[str, str]
    subsection_lines: dict[str, int]


def normalize_markdown(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def normalize_heading(title: str) -> str:
    return re.sub(r"\s+", " ", title.strip().replace("—", "-")).strip()


def strip_comments(text: str) -> str:
    return RE_HTML_COMMENT.sub("", text).strip()


def meaningful_text(text: str) -> str:
    cleaned = strip_comments(text)
    lines = [line.rstrip() for line in cleaned.split("\n")]
    return "\n".join(line for line in lines if line.strip() and line.strip() != "---").strip()


def is_placeholder(value: str) -> bool:
    cleaned = meaningful_text(value)
    if not cleaned:
        return True
    lowered = cleaned.lower()
    return "todo:" in lowered or cleaned in {"-", "- [ ]", "n/a?"}


def parse_metadata(markdown: str) -> dict[str, str]:
    match = RE_METADATA.search(markdown)
    if not match:
        return {}

    fields: dict[str, str] = {}
    for line in normalize_markdown(match.group(1)).split("\n"):
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip()] = strip_comments(value).strip()
    return fields


def collect_headings(markdown: str) -> list[Heading]:
    headings: list[Heading] = []
    for line_number, line in enumerate(markdown.split("\n"), start=1):
        match = RE_HEADING.match(line)
        if not match:
            continue
        title = match.group(2).strip()
        headings.append(
            Heading(
                level=len(match.group(1)),
                title=title,
                normalized=normalize_heading(title),
                line=line_number,
            )
        )
    return headings


def parse_sections(markdown: str) -> dict[str, Section]:
    lines = markdown.split("\n")
    h2_headings = [heading for heading in collect_headings(markdown) if heading.level == 2]
    sections: dict[str, Section] = {}

    for index, heading in enumerate(h2_headings):
        start = heading.line
        end = h2_headings[index + 1].line - 1 if index + 1 < len(h2_headings) else len(lines)
        body_lines = lines[start:end]
        body = "\n".join(body_lines)
        sections[heading.normalized] = Section(
            title=heading.normalized,
            line=heading.line,
            body=body,
            subsections=parse_h3_sections(body_lines, start + 1),
            subsection_lines=parse_h3_lines(body_lines, start + 1),
        )
    return sections


def parse_h3_sections(lines: Sequence[str], first_line_number: int) -> dict[str, str]:
    subsections: dict[str, list[str]] = {}
    current: str | None = None

    for offset, line in enumerate(lines):
        match = RE_HEADING.match(line)
        if match and len(match.group(1)) == 3:
            current = normalize_heading(match.group(2))
            subsections[current] = []
            continue
        if match:
            current = None
            continue
        if current is not None:
            subsections[current].append(line)

    return {title: "\n".join(content) for title, content in subsections.items()}


def parse_h3_lines(lines: Sequence[str], first_line_number: int) -> dict[str, int]:
    locations: dict[str, int] = {}
    for offset, line in enumerate(lines):
        match = RE_HEADING.match(line)
        if match and len(match.group(1)) == 3:
            locations[normalize_heading(match.group(2))] = first_line_number + offset
    return locations


def extract_bullets(text: str) -> list[str]:
    bullets: list[str] = []
    for line in strip_comments(text).split("\n"):
        match = RE_BULLET.match(line)
        if match:
            item = match.group(1).strip()
            if item and item not in {"-", "[ ]", "[x]"}:
                bullets.append(item)
    return bullets


def extract_checkboxes(text: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for line in strip_comments(text).split("\n"):
        match = RE_CHECKBOX.match(line)
        if not match:
            continue
        items.append({"checked": match.group("mark").lower() == "x", "text": match.group("text").strip()})
    return items


def validate_story(markdown: str) -> dict[str, Any]:
    normalized = normalize_markdown(markdown)
    issues: list[Issue] = []
    metadata = parse_metadata(normalized)
    headings = collect_headings(normalized)
    sections = parse_sections(normalized)
    h2_titles = [heading.normalized for heading in headings if heading.level == 2]

    validate_metadata(metadata, issues)
    validate_h2_order(h2_titles, headings, issues)
    validate_h3_layout(sections, issues)
    validate_unused_content(headings, sections, issues)

    context = build_canonical_context(metadata, sections)
    validate_semantics(context, issues)

    error_count = sum(1 for issue in issues if issue.severity == "error")
    warning_count = sum(1 for issue in issues if issue.severity == "warning")

    return {
        "valid": error_count == 0,
        "summary": {
            "errors": error_count,
            "warnings": warning_count,
            "agentReady": error_count == 0,
        },
        "issues": [issue.to_dict() for issue in issues],
    }


def validate_metadata(metadata: dict[str, str], issues: list[Issue]) -> None:
    if not metadata:
        add_error(issues, "metadata.missing", "metadata", "Bloco '<!-- metadata ... -->' é obrigatório.")
        return

    for field in REQUIRED_METADATA:
        if not metadata.get(field):
            add_error(issues, "metadata.field.missing", f"metadata.{field}", f"Campo metadata '{field}' é obrigatório.")

    story_id = metadata.get("id", "")
    if story_id and not RE_STORY_ID.match(story_id):
        add_warning(
            issues,
            "metadata.id.pattern",
            "metadata.id",
            "ID não segue o padrão esperado US-<AAA>-<YYYYMMDD>-<HHMM>.",
        )

    if metadata.get("type") and metadata["type"] != "story":
        add_error(issues, "metadata.type.invalid", "metadata.type", "Para estórias válidas, metadata.type deve ser 'story'.")
    if metadata.get("status") and metadata["status"] not in VALID_STATUSES:
        add_error(issues, "metadata.status.invalid", "metadata.status", "Status não é reconhecido pelo parser de Story.")
    if metadata.get("gate") and metadata["gate"] not in VALID_GATES:
        add_error(issues, "metadata.gate.invalid", "metadata.gate", "Gate deve ser um inteiro entre 0 e 4.")
    if metadata.get("title") and is_placeholder(metadata["title"]):
        add_error(issues, "metadata.title.placeholder", "metadata.title", "Título deve ser real, sem TODO ou placeholder.")


def validate_h2_order(h2_titles: list[str], headings: list[Heading], issues: list[Issue]) -> None:
    if h2_titles != CANONICAL_H2:
        add_error(
            issues,
            "layout.h2.order",
            "document.h2",
            "Headers H2 devem existir exatamente na ordem canônica do template de Story.",
        )

    canonical_set = set(CANONICAL_H2)
    dod_seen = False
    for heading in (item for item in headings if item.level == 2):
        if dod_seen:
            add_error(
                issues,
                "layout.h2.after_dod",
                f"line {heading.line}",
                f"H2 extra após DoD não será capturado para uso pelo plugin: '{heading.title}'. Regra: o parser de Story só consome os H2 canônicos até 'DoD - Definition of Done'.",
            )
        if heading.normalized == "DoD - Definition of Done":
            dod_seen = True
        if heading.normalized not in canonical_set:
            add_error(
                issues,
                "layout.h2.unknown",
                f"line {heading.line}",
                f"H2 não canônico não será capturado para uso pelo plugin: '{heading.title}'. Regra: /new, /draft e parseStory reconhecem apenas os H2 do template canônico.",
            )

    for expected in CANONICAL_H2:
        if expected not in h2_titles:
            add_error(issues, "layout.h2.missing", expected, f"H2 obrigatório ausente: '{expected}'.")


def validate_h3_layout(sections: dict[str, Section], issues: list[Issue]) -> None:
    for h2_title, expected_h3 in CANONICAL_H3.items():
        section = sections.get(h2_title)
        if not section:
            continue
        actual_h3 = list(section.subsections)
        if actual_h3 != expected_h3:
            add_error(
                issues,
                "layout.h3.order",
                h2_title,
                f"Subseções H3 de '{h2_title}' devem seguir exatamente: {', '.join(expected_h3)}.",
            )
        for title in actual_h3:
            if title not in expected_h3:
                line = section.subsection_lines.get(title, section.line)
                add_warning(
                    issues,
                    "layout.h3.unknown",
                    f"line {line}",
                    f"H3 não canônico não será capturado para uso pelo plugin: '{title}'. Regra: parseStory lê somente os títulos H3 mapeados explicitamente em StoryParser.",
                )


def validate_unused_content(headings: list[Heading], sections: dict[str, Section], issues: list[Issue]) -> None:
    for section_title, section in sections.items():
        if section_title in CANONICAL_H3:
            leading = section_body_before_first_h3(section)
            if leading:
                add_warning(
                    issues,
                    "scope.unused.h2.body",
                    f"line {section.line}",
                    f"Conteúdo direto em '{section_title}' antes da primeira subseção H3 não será capturado para uso pelo plugin. Regra: parseStory ignora o corpo dos H2 de agrupamento e lê apenas as H3 canônicas dessa seção.",
                )
            continue

        for title, line in section.subsection_lines.items():
            add_warning(
                issues,
                "scope.unused.h3",
                f"line {line}",
                f"H3 '{title}' não será capturado para uso pelo plugin. Regra: parseStory não lê subseções dentro de '{section_title}'; somente headings canônicos mapeados são consumidos.",
            )

    for heading in headings:
        if heading.level >= 4:
            add_warning(
                issues,
                "scope.unused.h4",
                f"line {heading.line}",
                f"Heading H{heading.level} '{heading.title}' não será capturado para uso pelo plugin. Regra: embora o parser base reconheça H2-H4, StoryParser só consulta campos por nomes canônicos de metadata, H3, DoR e DoD.",
            )


def section_body_before_first_h3(section: Section) -> str:
    lines: list[str] = []
    for line in section.body.split("\n"):
        match = RE_HEADING.match(line)
        if match and len(match.group(1)) == 3:
            break
        lines.append(line)
    return meaningful_text("\n".join(lines))


def build_canonical_context(metadata: dict[str, str], sections: dict[str, Section]) -> dict[str, Any]:
    def subsection(section_title: str, h3_title: str) -> str:
        section = sections.get(section_title)
        if not section:
            return ""
        return meaningful_text(section.subsections.get(h3_title, ""))

    def bullets(section_title: str, h3_title: str) -> list[str]:
        section = sections.get(section_title)
        if not section:
            return []
        return extract_bullets(section.subsections.get(h3_title, ""))

    dor_section = sections.get("DoR - Definition of Ready")
    dod_section = sections.get("DoD - Definition of Done")

    return {
        "metadata": {field: metadata.get(field, "") for field in REQUIRED_METADATA},
        "businessRequirement": {
            "problem": subsection("Requisito de Negócio", "Problema"),
            "value": subsection("Requisito de Negócio", "Valor"),
            "stakeholders": bullets("Requisito de Negócio", "Stakeholders"),
        },
        "functionalSpec": {
            "userStories": bullets("Especificação Funcional", "User Stories"),
            "acceptanceCriteria": bullets("Especificação Funcional", "Critérios de Aceite"),
            "outOfScope": bullets("Especificação Funcional", "Fora de Escopo"),
        },
        "nonFunctionalSpec": {
            "performance": subsection("Especificação Não-Funcional", "Performance"),
            "security": subsection("Especificação Não-Funcional", "Segurança"),
            "scalability": subsection("Especificação Não-Funcional", "Escalabilidade"),
            "usability": subsection("Especificação Não-Funcional", "Usabilidade"),
            "availability": subsection("Especificação Não-Funcional", "Disponibilidade"),
        },
        "technicalSpec": {
            "language": subsection("Especificação Técnica", "Linguagem"),
            "framework": subsection("Especificação Técnica", "Framework"),
            "architecture": subsection("Especificação Técnica", "Arquitetura"),
            "target": subsection("Especificação Técnica", "Target"),
            "database": subsection("Especificação Técnica", "Banco de Dados"),
            "infrastructure": subsection("Especificação Técnica", "Infraestrutura"),
            "projectStage": subsection("Especificação Técnica", "Estágio do Projeto"),
            "ci": subsection("Especificação Técnica", "CI"),
        },
        "dor": {"criteria": extract_checkboxes(dor_section.body if dor_section else "")},
        "dod": {"criteria": extract_bullets(dod_section.body if dod_section else "")},
    }


def validate_semantics(context: dict[str, Any], issues: list[Issue]) -> None:
    required_text_fields = [
        ("businessRequirement.problem", context["businessRequirement"]["problem"]),
        ("businessRequirement.value", context["businessRequirement"]["value"]),
        ("nonFunctionalSpec.performance", context["nonFunctionalSpec"]["performance"]),
        ("nonFunctionalSpec.security", context["nonFunctionalSpec"]["security"]),
        ("nonFunctionalSpec.scalability", context["nonFunctionalSpec"]["scalability"]),
        ("nonFunctionalSpec.usability", context["nonFunctionalSpec"]["usability"]),
        ("nonFunctionalSpec.availability", context["nonFunctionalSpec"]["availability"]),
        ("technicalSpec.database", context["technicalSpec"]["database"]),
        ("technicalSpec.infrastructure", context["technicalSpec"]["infrastructure"]),
    ]
    for location, value in required_text_fields:
        if is_placeholder(value):
            add_error(issues, "semantic.required.empty", location, "Campo obrigatório vazio ou com placeholder.")

    required_lists = [
        ("businessRequirement.stakeholders", context["businessRequirement"]["stakeholders"]),
        ("functionalSpec.userStories", context["functionalSpec"]["userStories"]),
        ("functionalSpec.acceptanceCriteria", context["functionalSpec"]["acceptanceCriteria"]),
        ("functionalSpec.outOfScope", context["functionalSpec"]["outOfScope"]),
        ("dod.criteria", context["dod"]["criteria"]),
    ]
    for location, values in required_lists:
        if not values:
            add_error(issues, "semantic.list.empty", location, "Lista obrigatória vazia ou sem itens reais.")

    validate_enum(context, issues, "technicalSpec.language", VALID_LANGUAGES)
    validate_enum(context, issues, "technicalSpec.framework", VALID_FRAMEWORKS)
    validate_enum(context, issues, "technicalSpec.architecture", VALID_ARCHITECTURES)
    validate_enum(context, issues, "technicalSpec.target", VALID_TARGETS)
    validate_enum(context, issues, "technicalSpec.projectStage", VALID_PROJECT_STAGES)
    validate_enum(context, issues, "technicalSpec.ci", VALID_CI)
    validate_dor(context, issues)
    validate_agent_readiness(context, issues)


def validate_enum(context: dict[str, Any], issues: list[Issue], path: str, valid_values: set[str]) -> None:
    section, field = path.split(".", 1)
    value = str(context[section][field]).strip()
    if not value:
        add_error(issues, "semantic.enum.empty", path, "Campo técnico obrigatório vazio.")
        return
    if value not in valid_values:
        add_error(issues, "semantic.enum.invalid", path, f"Valor '{value}' não é aceito. Use: {', '.join(sorted(valid_values))}.")


def validate_dor(context: dict[str, Any], issues: list[Issue]) -> None:
    criteria = context["dor"]["criteria"]
    if not criteria:
        add_error(issues, "semantic.dor.empty", "dor.criteria", "DoR deve conter critérios com checkbox.")
        return
    unchecked = [item["text"] for item in criteria if not item["checked"]]
    if unchecked:
        add_error(
            issues,
            "semantic.dor.unchecked",
            "dor.criteria",
            f"DoR possui {len(unchecked)} critério(s) não marcado(s); agentes não devem implementar sem Ready completo.",
        )


def validate_agent_readiness(context: dict[str, Any], issues: list[Issue]) -> None:
    acceptance_criteria = context["functionalSpec"]["acceptanceCriteria"]
    user_stories = context["functionalSpec"]["userStories"]

    if acceptance_criteria and len(acceptance_criteria) < len(user_stories):
        add_warning(
            issues,
            "readiness.criteria.coverage",
            "functionalSpec.acceptanceCriteria",
            "Há menos critérios de aceite que user stories; revise se cada comportamento testável está coberto.",
        )

    for index, criterion in enumerate(acceptance_criteria, start=1):
        lowered = criterion.lower()
        if any(term in lowered for term in VAGUE_TERMS):
            add_warning(
                issues,
                "readiness.criteria.vague",
                f"functionalSpec.acceptanceCriteria[{index}]",
                f"Critério pode estar vago para implementação/revisão automatizada: '{criterion}'.",
            )
        if len(criterion) < 20:
            add_warning(
                issues,
                "readiness.criteria.short",
                f"functionalSpec.acceptanceCriteria[{index}]",
                f"Critério muito curto pode não ser verificável: '{criterion}'.",
            )


def add_error(issues: list[Issue], code: str, location: str, message: str) -> None:
    issues.append(Issue("error", code, location, message))


def add_warning(issues: list[Issue], code: str, location: str, message: str) -> None:
    issues.append(Issue("warning", code, location, message))


def render_markdown_report(path: Path, result: dict[str, Any]) -> str:
    status = "válida" if result["valid"] else "inválida"
    lines = [
        f"# Validação da Story: {path.name}",
        "",
        f"Status: **{status}**",
        f"Erros: {result['summary']['errors']}",
        f"Avisos: {result['summary']['warnings']}",
        f"Pronta para agentes: {'sim' if result['summary']['agentReady'] else 'não'}",
        "",
        "## Achados",
    ]

    if result["issues"]:
        for issue in result["issues"]:
            lines.append(f"- [{issue['severity']}] {issue['code']} em {issue['location']}: {issue['message']}")
    else:
        lines.append("- Nenhum achado.")

    return "\n".join(lines)


def validate_file(markdown_file: Path) -> dict[str, Any]:
    try:
        markdown = markdown_file.read_text(encoding="utf-8")
    except OSError as exc:
        return {
            "file": markdown_file.name,
            "valid": False,
            "summary": {"errors": 1, "warnings": 0, "agentReady": False},
            "issues": [
                Issue(
                    "error",
                    "input.read_error",
                    str(markdown_file),
                    f"Erro ao ler arquivo: {exc}",
                ).to_dict()
            ],
        }

    result = validate_story(markdown)
    return {"file": markdown_file.name, **result}


def render_json_report(results: Sequence[dict[str, Any]]) -> str:
    payload: dict[str, Any]
    if len(results) == 1:
        payload = results[0]
    else:
        payload = {"results": list(results)}
    return json.dumps(payload, ensure_ascii=False, indent=2)


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Valida se um markdown de Story SpecKit está canônico, completo e pronto para agentes."
    )
    parser.add_argument("markdown_files", nargs="+", type=Path, help="Um ou mais arquivos markdown de Story a validar.")
    parser.add_argument("--json", action="store_true", help="Emite JSON estruturado em vez de relatório markdown.")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    markdown_files: list[Path] = args.markdown_files

    results = [validate_file(markdown_file) for markdown_file in markdown_files]
    if args.json:
        sys.stdout.write(render_json_report(results) + "\n")
    else:
        reports = [render_markdown_report(markdown_file, result) for markdown_file, result in zip(markdown_files, results)]
        sys.stdout.write("\n\n---\n\n".join(reports) + "\n")

    if any(issue["code"] == "input.read_error" for result in results for issue in result["issues"]):
        return 2
    return 0 if all(result["valid"] for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
