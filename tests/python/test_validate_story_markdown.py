from __future__ import annotations

import contextlib
import io
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType


def load_validator() -> ModuleType:
    root = Path(__file__).resolve().parents[2]
    script = root / "scripts" / "validate_story_markdown.py"
    spec = importlib.util.spec_from_file_location("validate_story_markdown", script)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load validate_story_markdown.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


validator = load_validator()


VALID_STORY = """# História US-ABC-20260429-1234

<!-- metadata
id: US-ABC-20260429-1234
title: Gerar relatório de comissões
createdAt: 2026-04-29
version: 1
type: story
status: open
gate: 0
-->

---

## Requisito de Negócio

### Problema
O time financeiro não consegue fechar comissões no mesmo dia porque o cálculo é manual.

### Valor
Automatizar o cálculo reduz atraso operacional e antecipa o fechamento financeiro diário.

### Stakeholders
- Time Financeiro
- Time Comercial

---

## Especificação Funcional

### User Stories
- Como analista financeiro, quero calcular comissões automaticamente para fechar o dia sem planilhas manuais

### Critérios de Aceite
- Dado um pedido pago com vendedor e valor, o sistema deve calcular comissão de 10% e persistir o resultado auditável
- Dado um pedido já processado, o sistema não deve duplicar a comissão ao receber o mesmo identificador novamente

### Fora de Escopo
- Pagamento efetivo das comissões

---

## Especificação Não-Funcional

### Performance
Processar 100 pedidos por minuto com P99 abaixo de 500ms por pedido.

### Segurança
Não registrar dados pessoais em logs e validar payload antes do processamento.

### Escalabilidade
Permitir aumento horizontal de workers sem duplicar processamento.

### Usabilidade
N/A para fluxo system-to-system.

### Disponibilidade
Operar com 99,5% de disponibilidade e retry limitado para falhas transitórias.

---

## Especificação Técnica

### Linguagem
typescript

### Framework
nestjs

### Arquitetura
hexagonal

### Target
backend

### Banco de Dados
PostgreSQL 15, tabela comissoes.

### Infraestrutura
Docker e Kubernetes, com CI via GitHub Actions.

### Estágio do Projeto
brownfield

### CI
github-actions

---

## DoR — Definition of Ready

- [x] Requisito de negócio documentado e aprovado
- [x] User stories com critérios de aceite mensuráveis
- [x] Escopo delimitado (o que está e o que não está incluído)
- [x] Requisitos não-funcionais definidos
- [x] Stack técnica decidida
- [x] Padrão arquitetural definido
- [x] DoD acordado com o time

---

## DoD — Definition of Done

- Todos os critérios de aceite validados por testes automatizados
- Cobertura de testes ≥ 80%
- Code review aprovado
- Documentação atualizada
"""


class StoryMarkdownValidatorTests(unittest.TestCase):
    def test_valid_story_returns_concise_result_without_canonical_context(self) -> None:
        result = validator.validate_story(VALID_STORY)

        self.assertTrue(result["valid"])
        self.assertEqual(result["summary"]["errors"], 0)
        self.assertNotIn("canonicalContext", result)
        self.assertNotIn("canonicalH2Complete", result["summary"])

    def test_markdown_report_does_not_include_canonical_context_section(self) -> None:
        result = validator.validate_story(VALID_STORY)

        report = validator.render_markdown_report(Path("scripts") / "STORY-001.md", result)

        self.assertIn("# Validação da Story: STORY-001.md", report)
        self.assertNotIn("## Contexto Canônico Semântico", report)
        self.assertNotIn("```json", report)

    def test_extra_h2_after_dod_is_invalid(self) -> None:
        result = validator.validate_story(VALID_STORY + "\n## Observações\nTexto fora do template.\n")

        self.assertFalse(result["valid"])
        self.assertIn("layout.h2.after_dod", {issue["code"] for issue in result["issues"]})
        self.assertIn("layout.h2.unknown", {issue["code"] for issue in result["issues"]})
        self.assertTrue(any("não será capturado para uso pelo plugin" in issue["message"] for issue in result["issues"]))

    def test_h4_content_is_reported_as_unused_by_plugin_parser(self) -> None:
        markdown = VALID_STORY.replace(
            "O time financeiro não consegue fechar comissões no mesmo dia porque o cálculo é manual.",
            "O time financeiro não consegue fechar comissões no mesmo dia porque o cálculo é manual.\n\n#### Observação interna\nEsse detalhe não está no template.",
        )

        result = validator.validate_story(markdown)

        self.assertTrue(result["valid"])
        self.assertIn("scope.unused.h4", {issue["code"] for issue in result["issues"]})
        self.assertTrue(any("StoryParser só consulta campos por nomes canônicos" in issue["message"] for issue in result["issues"]))

    def test_unchecked_dor_blocks_agent_readiness(self) -> None:
        markdown = VALID_STORY.replace("- [x] Stack técnica decidida", "- [ ] Stack técnica decidida")

        result = validator.validate_story(markdown)

        self.assertFalse(result["valid"])
        self.assertIn("semantic.dor.unchecked", {issue["code"] for issue in result["issues"]})
        self.assertFalse(result["summary"]["agentReady"])

    def test_placeholder_sections_are_invalid(self) -> None:
        markdown = VALID_STORY.replace(
            "O time financeiro não consegue fechar comissões no mesmo dia porque o cálculo é manual.",
            "<!-- TODO: preencher problema -->",
        )

        result = validator.validate_story(markdown)

        self.assertFalse(result["valid"])
        self.assertIn("semantic.required.empty", {issue["code"] for issue in result["issues"]})

    def test_main_accepts_multiple_files_in_markdown_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            valid = Path(tmp) / "STORY-VALID.md"
            invalid = Path(tmp) / "STORY-INVALID.md"
            valid.write_text(VALID_STORY, encoding="utf-8")
            invalid.write_text(VALID_STORY + "\n## Observações\nTexto fora do template.\n", encoding="utf-8")

            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exit_code = validator.main([str(valid), str(invalid)])

        output = stdout.getvalue()
        self.assertEqual(exit_code, 1)
        self.assertIn("# Validação da Story: STORY-VALID.md", output)
        self.assertIn("# Validação da Story: STORY-INVALID.md", output)
        self.assertIn("---", output)

    def test_main_accepts_multiple_files_in_json_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            first = Path(tmp) / "STORY-001.md"
            second = Path(tmp) / "STORY-002.md"
            first.write_text(VALID_STORY, encoding="utf-8")
            second.write_text(VALID_STORY + "\n## Observações\nTexto fora do template.\n", encoding="utf-8")

            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exit_code = validator.main([str(first), str(second), "--json"])

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 1)
        self.assertEqual([item["file"] for item in payload["results"]], ["STORY-001.md", "STORY-002.md"])
        self.assertNotIn("canonicalContext", payload["results"][0])


if __name__ == "__main__":
    unittest.main()
