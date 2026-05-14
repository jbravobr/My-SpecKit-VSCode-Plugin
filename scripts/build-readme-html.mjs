// Generates publish/0.5.0/README-0.5.0.html — rich animated HTML version of README.md
// Usage: node scripts/build-readme-html.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
});

// Custom renderers: add classes for animation hooks
const defaultFence = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options);
};

// Lookup table: ASCII fence content fingerprint → Mermaid replacement.
// We match by the first ~80 chars of the trimmed content to avoid mis-replacing.
const asciiToMermaid = [
  {
    fingerprint: "+------------+    +----------+    +-------------+",
    title: "Pipeline de comandos SpecKit",
    code: `flowchart LR
    A[Criar spec<br/><i>/draft /new /fix</i>]:::a --> B[Validar<br/><i>/validate</i>]:::b
    B --> C[Implementar<br/><i>agent implementador</i>]:::c
    C --> D[Revisar<br/><i>agent revisor</i>]:::d
    D --> E([Done]):::e
    classDef a fill:#243057,stroke:#7aa2ff,stroke-width:2px,color:#e8ecf6
    classDef b fill:#2a2557,stroke:#9d7aff,stroke-width:2px,color:#e8ecf6
    classDef c fill:#1b3a4d,stroke:#4cc9f0,stroke-width:2px,color:#e8ecf6
    classDef d fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    classDef e fill:#1a3a2e,stroke:#38d39f,stroke-width:3px,color:#e8ecf6`,
  },
  {
    fingerprint: "+=================== Criar a spec",
    title: "Fluxo Story · da criação à implementação",
    code: `flowchart TB
    subgraph CRIAR["Criar a spec"]
        direction TB
        D1["/draft (texto livre)"]:::a --> P1[elicit-story.prompt.md]:::p
        N1["/new (template)"]:::a --> P2[STORY-XXX.md no editor]:::p
        P1 --> Q1[Entrevista 6 fases]:::q
        Q1 --> S1[STORY-XXX.md]:::s
        P2 --> S1
    end
    subgraph VAL["Validar"]
        direction TB
        V1[/validate/]:::v --> CK{Lacunas?}:::ck
        CK -- Sim --> GF[gap-fill loop]:::g --> V1
        CK -- Não --> DOR[DoR atingido<br/>9 arquivos]:::done
    end
    subgraph IMP["Implementar + Revisar"]
        direction LR
        AI[agent implementador<br/>Gates 0-2]:::ai --> AR[agent revisor<br/>Gates 3-4]:::ar
    end
    CRIAR --> VAL --> IMP
    classDef a fill:#243057,stroke:#7aa2ff,stroke-width:2px,color:#e8ecf6
    classDef p fill:#2a2557,stroke:#9d7aff,stroke-width:2px,color:#e8ecf6
    classDef q fill:#1b3a4d,stroke:#4cc9f0,stroke-width:2px,color:#e8ecf6
    classDef s fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    classDef v fill:#243057,stroke:#7aa2ff,stroke-width:2px,color:#e8ecf6
    classDef ck fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    classDef g fill:#3a1f4d,stroke:#c98bff,stroke-width:2px,color:#e8ecf6
    classDef done fill:#1a3a2e,stroke:#38d39f,stroke-width:3px,color:#e8ecf6
    classDef ai fill:#1b3a4d,stroke:#4cc9f0,stroke-width:2px,color:#e8ecf6
    classDef ar fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    style CRIAR fill:#0f1428,stroke:#7aa2ff,color:#7aa2ff
    style VAL fill:#0f1428,stroke:#9d7aff,color:#9d7aff
    style IMP fill:#0f1428,stroke:#4cc9f0,color:#4cc9f0`,
  },
  {
    fingerprint: "+================== Criar a spec (Fix)",
    title: "Fluxo Fix · da criação à correção",
    code: `flowchart TB
    subgraph CRIAR["Criar a spec (Fix)"]
        direction TB
        D1["/draft --fix (texto livre)"]:::a --> P1[elicit-fix.prompt.md]:::p
        N1["/fix (template)"]:::a --> P2[FIX-XXX.md + stack auto]:::p
        P1 --> Q1[Entrevista 7 fases]:::q
        Q1 --> S1[FIX-XXX.md]:::s
        P2 --> S1
    end
    subgraph VAL["Validar"]
        direction TB
        V1[/validate/]:::v --> CK{Lacunas?}:::ck
        CK -- Sim --> GF[gap-fill loop]:::g --> V1
        CK -- Não --> DOR[Fix válido<br/>7 arquivos]:::done
    end
    subgraph IMP["Corrigir + Revisar"]
        direction LR
        AI[agent fix-implementador<br/>Gates 0-2]:::ai --> AR[agent fix-revisor<br/>Gates 3-4]:::ar
    end
    CRIAR --> VAL --> IMP
    classDef a fill:#243057,stroke:#7aa2ff,stroke-width:2px,color:#e8ecf6
    classDef p fill:#2a2557,stroke:#9d7aff,stroke-width:2px,color:#e8ecf6
    classDef q fill:#1b3a4d,stroke:#4cc9f0,stroke-width:2px,color:#e8ecf6
    classDef s fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    classDef v fill:#243057,stroke:#7aa2ff,stroke-width:2px,color:#e8ecf6
    classDef ck fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    classDef g fill:#3a1f4d,stroke:#c98bff,stroke-width:2px,color:#e8ecf6
    classDef done fill:#1a3a2e,stroke:#38d39f,stroke-width:3px,color:#e8ecf6
    classDef ai fill:#1b3a4d,stroke:#4cc9f0,stroke-width:2px,color:#e8ecf6
    classDef ar fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    style CRIAR fill:#0f1428,stroke:#ff6b8a,color:#ff6b8a
    style VAL fill:#0f1428,stroke:#9d7aff,color:#9d7aff
    style IMP fill:#0f1428,stroke:#4cc9f0,color:#4cc9f0`,
  },
  {
    fingerprint: "+== Sessao A: agent implementador",
    title: "Handoff entre sessões · Implementador → Revisor",
    code: `flowchart LR
    subgraph SA["Sessão A · agent implementador"]
        direction LR
        G0[Gate 0<br/>Alinhamento]:::g0 --> G1[Gate 1<br/>Implementação]:::g1
        G1 --> G2[Gate 2<br/>Testes]:::g2
    end
    subgraph SB["Sessão B · agent revisor"]
        direction LR
        G3[Gate 3<br/>Revisão]:::g3 --> G4[Gate 4<br/>Entrega]:::g4
    end
    SA -- "Novo Chat" --> SB
    classDef g0 fill:#243057,stroke:#7aa2ff,stroke-width:2px,color:#e8ecf6
    classDef g1 fill:#2a2557,stroke:#9d7aff,stroke-width:2px,color:#e8ecf6
    classDef g2 fill:#1b3a4d,stroke:#4cc9f0,stroke-width:2px,color:#e8ecf6
    classDef g3 fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    classDef g4 fill:#1a3a2e,stroke:#38d39f,stroke-width:3px,color:#e8ecf6
    style SA fill:#0f1428,stroke:#4cc9f0,color:#4cc9f0
    style SB fill:#0f1428,stroke:#ffb454,color:#ffb454`,
  },
  {
    fingerprint: "| default |-->| implementador",
    title: "Modos do agente · grafo de transição",
    code: `flowchart LR
    DEF[default]:::d -->|/agent implementador| IMP[implementador]:::a
    IMP -->|/agent revisor| REV[revisor]:::b
    REV -->|/agent debugger| DBG[debugger]:::c
    DBG -->|/agent refactor| RFT[refactor]:::e
    RFT -->|/agent default| DEF
    classDef d fill:#243057,stroke:#7aa2ff,stroke-width:2px,color:#e8ecf6
    classDef a fill:#1b3a4d,stroke:#4cc9f0,stroke-width:2px,color:#e8ecf6
    classDef b fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    classDef c fill:#3a1f4d,stroke:#c98bff,stroke-width:2px,color:#e8ecf6
    classDef e fill:#1a3a2e,stroke:#58e1c2,stroke-width:2px,color:#e8ecf6`,
  },
  {
    fingerprint: "+== Sessao 1: SpecKit Chat",
    title: "Três sessões · ciclo completo",
    code: `flowchart LR
    subgraph S1["Sessão 1 · SpecKit Chat"]
        direction TB
        N1[Instalar plugin]:::a --> N2[Criar spec]:::a --> N3[Validar spec]:::a
    end
    subgraph S2["Sessão 2 · Implementador"]
        direction TB
        N4[Gate 0 — Alinhar]:::b --> N5[Gate 1 — Implementar]:::b --> N6[Gate 2 — Testar]:::b
    end
    subgraph S3["Sessão 3 · Revisor"]
        direction TB
        N7[Gate 3 — Revisar]:::c --> N8[Gate 4 — Entregar]:::c
    end
    S1 --> S2 --> S3
    classDef a fill:#243057,stroke:#7aa2ff,stroke-width:2px,color:#e8ecf6
    classDef b fill:#1b3a4d,stroke:#4cc9f0,stroke-width:2px,color:#e8ecf6
    classDef c fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    style S1 fill:#0f1428,stroke:#7aa2ff,color:#7aa2ff
    style S2 fill:#0f1428,stroke:#4cc9f0,color:#4cc9f0
    style S3 fill:#0f1428,stroke:#ffb454,color:#ffb454`,
  },
  {
    fingerprint: 'Voce                        @speckit                    Copilot Agente',
    title: "Sequence · criação de Story",
    code: `sequenceDiagram
    autonumber
    actor U as Você
    participant S as @speckit
    participant A as Copilot Agente
    U->>S: /draft "Calcular comissão via Kafka"
    S-->>U: elicit-story-001.prompt
    U->>A: Abrir em Novo Chat Agente
    loop 6 fases (1 pergunta por vez)
        A->>U: Pergunta Negócio / Funcional / NFR / Tech / DoR
        U->>A: Responde
        A-->>U: Registrado. Próxima…
    end
    A-->>U: STORY-001.md criado
    U->>S: /validate
    S-->>U: DoR atingido — 9 arquivos
    S-->>U: Novo Chat → implementador`,
  },
  {
    fingerprint: 'retorna 500 apos token',
    title: "Sequence · criação de Fix",
    code: `sequenceDiagram
    autonumber
    actor U as Você
    participant S as @speckit
    participant A as Copilot Agente
    U->>S: /draft "Login OAuth2 retorna 500 após token"
    Note right of S: Detecta "500" → intent fix
    S-->>U: elicit-fix-001.prompt
    U->>A: Abrir em Novo Chat Agente
    loop 7 fases
        A->>U: Bug / Hipótese / Impacto / Regressão / Ctx / DoF
        U->>A: Responde
    end
    A-->>U: FIX-001.md criado
    U->>S: /validate
    S-->>U: Fix válido — 7 arquivos
    S-->>U: Novo Chat → fix-implementador`,
  },
  {
    fingerprint: "/validate (story com lacunas)",
    title: "Sequence · loop gap-fill de Story",
    code: `sequenceDiagram
    autonumber
    actor U as Você
    participant S as @speckit
    U->>S: /validate (story com lacunas)
    S-->>U: 6 lacunas encontradas
    loop 6 lacunas
        S->>U: Lacuna N — pergunta direcionada
        U-->>S: Resposta concisa
    end
    S-->>U: Todas as lacunas preenchidas
    U->>S: /validate (novamente)
    S-->>U: DoR atingido — 9 arquivos gerados`,
  },
  {
    fingerprint: "/validate (fix com lacunas)",
    title: "Sequence · loop gap-fill de Fix",
    code: `sequenceDiagram
    autonumber
    actor U as Você
    participant S as @speckit
    U->>S: /validate (fix com lacunas)
    S-->>U: Lacunas encontradas
    loop até preencher
        S->>U: Lacuna N — pergunta direcionada
        U-->>S: Resposta concisa
    end
    S-->>U: Todas as lacunas preenchidas
    U->>S: /validate
    S-->>U: Fix válido — 7 arquivos gerados`,
  },
];

function tryAsciiToMermaid(content) {
  const trimmed = content.trim();
  for (const entry of asciiToMermaid) {
    if (trimmed.includes(entry.fingerprint)) {
      return entry;
    }
  }
  return null;
}

md.renderer.rules.fence = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const info = (token.info || "").trim();
  if (info === "mermaid") {
    return `<div class="mermaid-wrap reveal"><pre class="mermaid">${token.content}</pre></div>\n`;
  }
  if (info === "" || info === "text" || info === "txt") {
    const match = tryAsciiToMermaid(token.content);
    if (match) {
      return `\n<figure class="diagram-figure reveal">\n  <figcaption class="diagram-caption">${match.title}</figcaption>\n  <div class="mermaid-wrap"><pre class="mermaid">${match.code}</pre></div>\n</figure>\n`;
    }
  }
  const html = defaultFence(tokens, idx, options, env, self);
  return html.replace("<pre", '<pre class="reveal"');
};

md.renderer.rules.table_open = () => '<div class="table-wrap reveal"><table>';
md.renderer.rules.table_close = () => "</table></div>";

md.renderer.rules.heading_open = function (tokens, idx) {
  const tag = tokens[idx].tag;
  const next = tokens[idx + 1];
  const text = next && next.content ? next.content : "";
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  const cls = tag === "h1" || tag === "h2" ? "reveal section-title" : "reveal";
  return `<${tag} id="${slug}" class="${cls}">`;
};

md.renderer.rules.blockquote_open = () => '<blockquote class="reveal callout">';
md.renderer.rules.bullet_list_open = () => '<ul class="reveal">';
md.renderer.rules.ordered_list_open = () => '<ol class="reveal">';
md.renderer.rules.paragraph_open = (tokens, idx) => {
  const next = tokens[idx + 1];
  const text = next && next.content ? next.content : "";
  if (text.startsWith(">") || text.length < 4) return "<p>";
  return '<p class="reveal">';
};

const source = fs.readFileSync(path.join(root, "README.md"), "utf8");
const body = md.render(source);

// Mermaid diagrams to inject after specific anchors (h2 ids).
// Detected anchor → diagram code (Mermaid). They are inserted right AFTER the h2 closing tag.
const injections = [
  {
    after: "gates-de-implementacao",
    code: `flowchart LR
    G0([Gate 0<br/>Story Draft]):::g0 --> G1([Gate 1<br/>Spec Review]):::g1
    G1 --> G2([Gate 2<br/>Implementation]):::g2
    G2 --> G3([Gate 3<br/>Testing & Review]):::g3
    G3 --> G4([Gate 4<br/>Done]):::g4
    classDef g0 fill:#243057,stroke:#7aa2ff,stroke-width:2px,color:#e8ecf6
    classDef g1 fill:#2a2557,stroke:#9d7aff,stroke-width:2px,color:#e8ecf6
    classDef g2 fill:#1b3a4d,stroke:#4cc9f0,stroke-width:2px,color:#e8ecf6
    classDef g3 fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    classDef g4 fill:#1a3a2e,stroke:#38d39f,stroke-width:2px,color:#e8ecf6`,
    title: "Linha do tempo dos cinco gates",
  },
  {
    after: "como-usar",
    code: `sequenceDiagram
    autonumber
    participant U as User
    participant P as Participant
    participant L as LLM
    U->>P: @speckit /new "minha story"
    P->>L: Layered prompt + scaffold
    L-->>P: Story esqueleto
    P-->>U: spec criada em .speckit/specs/
    U->>P: /draft → /implement → /review-auto
    P->>L: Camadas de prompt por gate
    L-->>P: Implementação + revisão
    P-->>U: Evidência + transição de gate`,
    title: "Fluxo típico de uma sessão SDD",
  },
  {
    after: "estrategia-de-prompt-layering-e-tokens",
    code: `flowchart TB
    L1[Layer 1<br/>System Identity]:::a --> L2[Layer 2<br/>Workflow Rules]:::b
    L2 --> L3[Layer 3<br/>Gate Context]:::c
    L3 --> L4[Layer 4<br/>Story Spec]:::d
    L4 --> L5[Layer 5<br/>User Intent]:::e
    L5 --> OUT([LLM Call]):::out
    classDef a fill:#243057,stroke:#7aa2ff,stroke-width:2px,color:#e8ecf6
    classDef b fill:#2a2557,stroke:#9d7aff,stroke-width:2px,color:#e8ecf6
    classDef c fill:#1b3a4d,stroke:#4cc9f0,stroke-width:2px,color:#e8ecf6
    classDef d fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    classDef e fill:#1a3a2e,stroke:#58e1c2,stroke-width:2px,color:#e8ecf6
    classDef out fill:#3a1f4d,stroke:#c98bff,stroke-width:3px,color:#e8ecf6`,
    title: "As cinco camadas do prompt",
  },
  {
    after: "modos-de-agente",
    code: `stateDiagram-v2
    [*] --> Implementador
    Implementador --> Revisor: findings encontrados
    Revisor --> Implementador: ajustes solicitados
    Revisor --> Aprovado: tudo passou
    Implementador --> LimiteAtingido: 5 tentativas
    Aprovado --> [*]
    LimiteAtingido --> [*]`,
    title: "Loop Implementador ↔ Revisor",
  },
  {
    after: "garantias-de-qualidade-por-gate",
    code: `flowchart LR
    subgraph G1[Gate 1]
        H1[heuristic]:::v1
        T1[typecheck]:::v1
    end
    subgraph G2[Gate 2]
        T2[typecheck]:::v2
        A2[ac-presence]:::v2
        S2[secret-leak]:::v2
    end
    subgraph G3[Gate 3]
        A3[ac-presence]:::v3
        TE3[test-execution]:::v3
        C3[coverage]:::v3
        CR3[crap]:::v3
        S3[secret-leak]:::v3
    end
    G1 --> G2 --> G3
    classDef v1 fill:#243057,stroke:#7aa2ff,stroke-width:2px,color:#e8ecf6
    classDef v2 fill:#1b3a4d,stroke:#4cc9f0,stroke-width:2px,color:#e8ecf6
    classDef v3 fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    style G1 fill:#11172b,stroke:#7aa2ff,stroke-width:2px,color:#7aa2ff
    style G2 fill:#11172b,stroke:#4cc9f0,stroke-width:2px,color:#4cc9f0
    style G3 fill:#11172b,stroke:#ffb454,stroke-width:2px,color:#ffb454`,
    title: "Mapa validador × gate (v0.5.0)",
  },
  {
    after: "rastreabilidade-e-auditoria",
    code: `flowchart LR
    SPEC[.speckit/specs/<br/>story.md]:::s --> CODE[src/feature/<br/>*.ts]:::c
    CODE --> TEST[tests/<br/>*.test.ts]:::t
    TEST --> EVID[.speckit/evidence/<br/>latest.md]:::e
    EVID --> METR[.speckit/metrics/<br/>events.jsonl]:::m
    METR --> AUDIT[Auditoria local]:::a
    classDef s fill:#1a3a2e,stroke:#58e1c2,stroke-width:2px,color:#e8ecf6
    classDef c fill:#243057,stroke:#7aa2ff,stroke-width:2px,color:#e8ecf6
    classDef t fill:#2a2557,stroke:#9d7aff,stroke-width:2px,color:#e8ecf6
    classDef e fill:#3d2e1a,stroke:#ffb454,stroke-width:2px,color:#e8ecf6
    classDef m fill:#1b3a4d,stroke:#4cc9f0,stroke-width:2px,color:#e8ecf6
    classDef a fill:#3a1f4d,stroke:#c98bff,stroke-width:3px,color:#e8ecf6,font-weight:bold`,
    title: "Rastreabilidade ponta-a-ponta",
  },
];

let injected = body;
for (const inj of injections) {
  const re = new RegExp(`(<h2 id="${inj.after}"[^>]*>[^<]*</h2>)`, "i");
  const block = `\n<figure class="diagram-figure reveal">\n  <figcaption class="diagram-caption">${inj.title}</figcaption>\n  <div class="mermaid-wrap">\n    <pre class="mermaid">${inj.code}</pre>\n  </div>\n</figure>\n`;
  if (re.test(injected)) {
    injected = injected.replace(re, `$1${block}`);
  }
}

// Build TOC from h2s
const tocItems = [];
const tocRegex = /<h2 id="([^"]+)"[^>]*>(.*?)<\/h2>/g;
let m;
while ((m = tocRegex.exec(injected)) !== null) {
  tocItems.push({ id: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() });
}
const tocHtml = tocItems
  .slice(0, 20)
  .map((t, i) => `<a href="#${t.id}" class="toc-item" style="--i:${i}"><span class="toc-num">${String(i + 1).padStart(2, "0")}</span><span class="toc-text">${t.text}</span></a>`)
  .join("\n");

const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SpecKit — Spec Driven Development · README · v0.5.0</title>
    <meta name="description" content="Documentação completa da extensão SpecKit em formato HTML rico, com diagramas animados e layout A3." />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
    <style>
      :root {
        /* Paleta enriquecida */
        --bg-0: #07091a;
        --bg-1: #0d1228;
        --bg-2: #131836;
        --surface: #1a2147;
        --surface-2: #232c5a;
        --line: #2e3a6e;
        --line-soft: rgba(122,162,255,0.18);
        --text: #f1f4ff;
        --text-dim: #b8c2e0;
        --text-muted: #7c87a9;
        --accent: #7aa2ff;
        --accent-2: #c98bff;
        --accent-3: #58e1c2;
        --user: #58e1c2;
        --participant: #ffb454;
        --llm: #c98bff;
        --success: #38d39f;
        --warn: #ffb454;
        --danger: #ff6b8a;
        --gate: #4cc9f0;
        --pink: #ff6b8a;
        --gradient-hero: linear-gradient(135deg, #07091a 0%, #1d2056 35%, #3a1f63 70%, #4f1f4f 100%);
        --gradient-accent: linear-gradient(135deg, #7aa2ff 0%, #c98bff 100%);
        --gradient-success: linear-gradient(135deg, #38d39f 0%, #4cc9f0 100%);
        --gradient-warm: linear-gradient(135deg, #ffb454 0%, #ff6b8a 100%);
        --gradient-aurora: linear-gradient(120deg, #7aa2ff, #c98bff, #58e1c2, #ffb454, #ff6b8a);
        --shadow-md: 0 8px 28px rgba(0,0,0,0.35);
        --shadow-lg: 0 24px 60px rgba(0,0,0,0.45);
        /* Tipografia */
        --font-body: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        --font-display: "Bricolage Grotesque", "Plus Jakarta Sans", system-ui, sans-serif;
        --font-mono: "JetBrains Mono", "SF Mono", Consolas, monospace;
        /* Layout A3 landscape (1587px @96dpi); prosa limitada para legibilidade */
        --doc-max: 1480px;
        --prose-max: 78ch;     /* limite ótimo de leitura */
        --doc-pad-x: 96px;
        --doc-pad-y: 96px;
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }
      html { scroll-behavior: smooth; }
      body {
        font-family: var(--font-body);
        font-feature-settings: "ss01", "ss02", "cv01", "cv11";
        background: var(--bg-0);
        color: var(--text);
        line-height: 1.7;
        font-size: 16.5px;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        overflow-x: hidden;
      }
      code, pre, .mono { font-family: var(--font-mono); }

      /* ==================== ANIMAÇÕES ==================== */
      @keyframes fadeUp { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes pulseDot {
        0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 12px var(--success); }
        50% { opacity: 0.55; transform: scale(1.35); box-shadow: 0 0 22px var(--success); }
      }
      @keyframes auroraShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
      @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      @keyframes shimmer { 0% { background-position: -1200px 0; } 100% { background-position: 1200px 0; } }
      @keyframes drawLine { from { stroke-dashoffset: 1500; } to { stroke-dashoffset: 0; } }
      @keyframes blink { 50% { opacity: 0; } }

      /* ==================== PROGRESS BAR ==================== */
      .progress-bar {
        position: fixed; top: 0; left: 0;
        height: 3px; width: 0%;
        background: var(--gradient-aurora);
        background-size: 300% 100%;
        animation: auroraShift 6s ease infinite;
        z-index: 1000;
        box-shadow: 0 0 14px rgba(122,162,255,0.7);
        transition: width 0.1s linear;
      }

      /* ==================== TOP NAV ==================== */
      .topnav {
        position: fixed; top: 14px; right: 18px; z-index: 999;
        background: rgba(13,18,40,0.85);
        backdrop-filter: blur(14px) saturate(1.4);
        border: 1px solid var(--line);
        border-radius: 100px;
        padding: 8px 14px;
        display: flex; gap: 4px;
        font-size: 12px; font-weight: 600;
        font-family: var(--font-body);
        animation: fadeIn 0.8s ease 0.3s backwards;
      }
      .topnav a {
        color: var(--text-dim); text-decoration: none;
        padding: 6px 13px; border-radius: 100px;
        transition: all 0.25s;
      }
      .topnav a:hover { color: var(--text); background: rgba(122,162,255,0.18); transform: translateY(-1px); }
      @media (max-width: 1100px) { .topnav { display: none; } }

      /* ==================== HERO ==================== */
      .hero {
        background: var(--gradient-hero);
        padding: 160px var(--doc-pad-x) 130px;
        position: relative; overflow: hidden;
        border-bottom: 1px solid var(--line);
      }
      .hero::before {
        content: ""; position: absolute;
        top: -40%; left: -15%; width: 70%; height: 200%;
        background: radial-gradient(circle, rgba(201,139,255,0.22) 0%, transparent 60%);
        pointer-events: none; animation: float 9s ease-in-out infinite;
      }
      .hero::after {
        content: ""; position: absolute;
        bottom: -40%; right: -15%; width: 70%; height: 200%;
        background: radial-gradient(circle, rgba(88,225,194,0.18) 0%, transparent 60%);
        pointer-events: none; animation: float 11s ease-in-out infinite reverse;
      }
      .hero-inner { max-width: var(--doc-max); margin: 0 auto; position: relative; z-index: 1; }
      .eyebrow {
        display: inline-flex; align-items: center; gap: 10px;
        padding: 9px 20px;
        background: rgba(201,139,255,0.14);
        border: 1px solid rgba(201,139,255,0.4);
        border-radius: 100px;
        font-size: 12px; font-weight: 700;
        color: #d9b8ff;
        letter-spacing: 0.14em; text-transform: uppercase;
        margin-bottom: 32px;
        animation: fadeUp 0.7s ease;
      }
      .eyebrow .dot {
        width: 8px; height: 8px;
        background: var(--success);
        border-radius: 50%;
        animation: pulseDot 2s ease-in-out infinite;
      }
      .hero h1 {
        font-family: var(--font-display);
        font-size: clamp(44px, 6.8vw, 88px);
        font-weight: 800; line-height: 1.02;
        letter-spacing: -0.035em;
        background: linear-gradient(135deg, #ffffff 0%, #d2dafc 60%, #b8c2e0 100%);
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 28px;
        animation: fadeUp 0.9s ease 0.1s backwards;
      }
      .hero h1 .grad {
        background: var(--gradient-aurora);
        background-size: 300% 100%;
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: auroraShift 8s ease infinite;
      }
      .hero-lead {
        font-size: clamp(17px, 1.45vw, 22px);
        color: var(--text-dim);
        margin-bottom: 56px; font-weight: 400;
        max-width: 1100px;
        line-height: 1.65;
        animation: fadeUp 1s ease 0.25s backwards;
      }
      .hero-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 16px;
        animation: fadeUp 1s ease 0.4s backwards;
      }
      .meta-card {
        background: rgba(26,33,71,0.65);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 20px 22px;
        backdrop-filter: blur(10px);
        transition: transform 0.4s cubic-bezier(0.2,0.8,0.2,1), border-color 0.3s, box-shadow 0.3s;
        position: relative; overflow: hidden;
      }
      .meta-card::before {
        content: ""; position: absolute; inset: 0;
        background: var(--gradient-accent); opacity: 0; transition: opacity 0.3s;
      }
      .meta-card:hover { transform: translateY(-5px); border-color: var(--accent-2); box-shadow: 0 14px 32px rgba(201,139,255,0.22); }
      .meta-card .label { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 8px; }
      .meta-card .value { font-size: 23px; font-weight: 700; color: var(--text); font-family: var(--font-display); }
      .meta-card .value small { font-size: 13px; color: var(--text-dim); font-weight: 500; margin-left: 5px; font-family: var(--font-body); }

      /* ==================== TOC ==================== */
      .toc-section {
        padding: var(--doc-pad-y) var(--doc-pad-x);
        background: linear-gradient(180deg, var(--bg-1) 0%, var(--bg-0) 100%);
        border-bottom: 1px solid var(--line);
      }
      .toc-inner { max-width: var(--doc-max); margin: 0 auto; }
      .toc-title {
        font-size: 12px; font-weight: 800; letter-spacing: 0.22em;
        text-transform: uppercase; color: var(--accent-2);
        margin-bottom: 28px;
      }
      .toc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
      .toc-item {
        display: flex; align-items: center; gap: 14px;
        padding: 16px 20px;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 14px;
        color: var(--text-dim); text-decoration: none;
        font-size: 14.5px; font-weight: 500;
        transition: all 0.35s cubic-bezier(0.2,0.8,0.2,1);
        animation: fadeUp 0.5s ease backwards;
        animation-delay: calc(var(--i, 0) * 40ms);
        position: relative; overflow: hidden;
      }
      .toc-item::after {
        content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
        background: var(--gradient-accent); transform: scaleY(0); transform-origin: bottom;
        transition: transform 0.3s ease;
      }
      .toc-item:hover { transform: translateX(6px); border-color: var(--accent-2); color: var(--text); background: var(--surface-2); }
      .toc-item:hover::after { transform: scaleY(1); transform-origin: top; }
      .toc-num { font-family: var(--font-mono); font-size: 12px; color: var(--accent-2); font-weight: 700; }
      .toc-text { flex: 1; }

      /* ==================== DOC CONTENT ==================== */
      .doc {
        max-width: var(--doc-max);
        margin: 0 auto;
        padding: var(--doc-pad-y) var(--doc-pad-x);
        position: relative;
      }
      /* Justificação ergonômica: A3 landscape tem largura generosa,
         então mantemos a prosa cobrindo toda a coluna do .doc para que
         a justificação fique VISÍVEL (múltiplas linhas por parágrafo).
         text-align-last NÃO é forçado a left, pois isso anula a justificação
         em parágrafos curtos. Mantemos hifenização para evitar rios. */
      .doc p, .doc li {
        text-align: justify;
        text-justify: inter-word;
        hyphens: auto;
        -webkit-hyphens: auto;
        word-spacing: -0.015em;
        overflow-wrap: break-word;
      }
      .doc blockquote p { text-align: justify; }
      .doc h1, .doc h2, .doc h3, .doc h4 { text-align: left; }
      .doc h1 {
        font-family: var(--font-display);
        font-size: clamp(34px, 4.4vw, 60px);
        font-weight: 800; line-height: 1.08; letter-spacing: -0.03em;
        margin: 80px 0 28px;
        background: linear-gradient(135deg, #ffffff 0%, #c98bff 100%);
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .doc h1:first-child { margin-top: 0; }
      .doc h2 {
        font-family: var(--font-display);
        font-size: clamp(26px, 2.8vw, 40px);
        font-weight: 800; line-height: 1.18; letter-spacing: -0.022em;
        margin: 76px 0 24px;
        color: var(--text);
        padding-left: 22px;
        border-left: 5px solid;
        border-image: var(--gradient-accent) 1;
      }
      .doc h3 {
        font-family: var(--font-display);
        font-size: 24px; font-weight: 700;
        margin: 44px 0 16px; color: var(--accent);
        letter-spacing: -0.01em;
      }
      .doc h4 {
        font-family: var(--font-display);
        font-size: 18px; font-weight: 700;
        margin: 28px 0 12px; color: var(--accent-2);
        letter-spacing: -0.005em;
      }
      .doc p { margin: 16px 0; color: var(--text-dim); font-size: 16.5px; line-height: 1.75; }
      .doc strong { color: var(--text); font-weight: 700; }
      .doc em { color: var(--text); font-style: italic; }
      .doc a {
        color: var(--accent); text-decoration: none;
        background: linear-gradient(180deg, transparent 92%, rgba(122,162,255,0.5) 92%);
        background-size: 100% 100%; transition: all 0.25s;
      }
      .doc a:hover { color: var(--accent-2); background: linear-gradient(180deg, transparent 92%, rgba(201,139,255,0.6) 92%); }
      .doc ul, .doc ol { margin: 16px 0 22px 30px; color: var(--text-dim); }
      .doc li { margin-bottom: 10px; font-size: 16.5px; line-height: 1.72; }
      .doc li::marker { color: var(--accent-2); font-weight: 700; }
      .doc hr {
        border: none; height: 1px;
        background: linear-gradient(90deg, transparent, var(--line) 20%, var(--accent-2) 50%, var(--line) 80%, transparent);
        margin: 60px 0;
        opacity: 0.5;
      }
      .doc code:not(pre code) {
        background: linear-gradient(135deg, rgba(122,162,255,0.16), rgba(201,139,255,0.12));
        color: var(--accent);
        padding: 3px 9px;
        border-radius: 6px;
        font-size: 0.88em;
        font-weight: 500;
        border: 1px solid rgba(122,162,255,0.22);
        word-break: break-word;
      }
      .doc pre {
        background: linear-gradient(180deg, #060a18 0%, #0a0f24 100%);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 22px 24px;
        margin: 20px 0 28px;
        overflow-x: auto;
        font-size: 13.5px;
        line-height: 1.7;
        color: #d4dbef;
        position: relative;
      }
      .doc pre::before {
        content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
        background: var(--gradient-accent); opacity: 0.7;
        border-top-left-radius: 14px; border-top-right-radius: 14px;
      }
      .doc pre code { color: #d4dbef; font-size: 13.5px; }
      .doc blockquote.callout {
        background: linear-gradient(135deg, rgba(122,162,255,0.08), rgba(201,139,255,0.05));
        border-left: 4px solid var(--accent-2);
        border-radius: 10px;
        padding: 18px 24px;
        margin: 22px 0 28px;
        color: var(--text-dim);
        font-size: 15.5px;
      }
      .doc blockquote.callout p { margin: 6px 0; max-width: 100%; }

      /* ==================== TABLE ==================== */
      .table-wrap {
        overflow-x: auto;
        margin: 20px 0 32px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: var(--surface);
        box-shadow: var(--shadow-md);
      }
      .doc table { width: 100%; border-collapse: collapse; font-size: 14.5px; font-family: var(--font-body); }
      .doc thead { background: linear-gradient(135deg, var(--surface-2), var(--surface)); }
      .doc th, .doc td {
        text-align: left;
        padding: 14px 20px;
        border-bottom: 1px solid var(--line);
        color: var(--text-dim);
      }
      .doc th { color: var(--text); font-weight: 700; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase; font-family: var(--font-display); }
      .doc tbody tr { transition: background 0.2s; }
      .doc tbody tr:hover { background: rgba(122,162,255,0.06); }
      .doc tbody tr:last-child td { border-bottom: none; }

      /* ==================== MERMAID ==================== */
      .diagram-figure { margin: 36px 0 44px; }
      .diagram-caption {
        font-size: 12px; font-weight: 800; letter-spacing: 0.18em;
        text-transform: uppercase; color: var(--accent-2);
        margin-bottom: 16px; text-align: left;
        font-family: var(--font-display);
      }
      .mermaid-wrap {
        background:
          radial-gradient(ellipse at top left, rgba(122,162,255,0.12), transparent 55%),
          radial-gradient(ellipse at bottom right, rgba(201,139,255,0.12), transparent 55%),
          radial-gradient(ellipse at center, rgba(88,225,194,0.05), transparent 70%),
          var(--bg-2);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 44px 36px;
        margin: 20px 0 36px;
        text-align: center;
        overflow-x: auto;
        position: relative;
        box-shadow: inset 0 0 60px rgba(122,162,255,0.04), var(--shadow-md);
      }
      .mermaid-wrap::before {
        content: ""; position: absolute; inset: 0;
        background: linear-gradient(90deg, transparent, rgba(201,139,255,0.07), transparent);
        background-size: 1400px 100%;
        animation: shimmer 8s linear infinite;
        pointer-events: none; border-radius: 18px;
      }
      /* ==================== MERMAID — animações sutis e seguras ==================== */
      .mermaid { position: relative; z-index: 1; }
      .mermaid svg { max-width: 100%; height: auto !important; }
      /* Princípio: NUNCA aplicar opacity:0 nem transform em g.node/g.actor/g.cluster
         por default. Se algo der errado no observer, os elementos precisam
         permanecer VISÍVEIS. Animamos apenas:
           - opacity do <svg> inteiro (fade-in suave)
           - stroke-dashoffset das arestas (drawLine sutil)
           - filter glow em hover (interativo, opcional) */
      .mermaid-wrap .mermaid svg {
        opacity: 0;
        transition: opacity 0.9s cubic-bezier(0.2,0.8,0.2,1);
      }
      .mermaid-wrap.is-visible .mermaid svg { opacity: 1; }

      .mermaid-wrap .mermaid .edgePath path,
      .mermaid-wrap .mermaid .flowchart-link,
      .mermaid-wrap .mermaid path.transition {
        stroke-dasharray: 1200;
        stroke-dashoffset: 1200;
      }
      .mermaid-wrap.is-visible .mermaid .edgePath path,
      .mermaid-wrap.is-visible .mermaid .flowchart-link,
      .mermaid-wrap.is-visible .mermaid path.transition {
        animation: drawLine 1.4s cubic-bezier(0.2,0.8,0.2,1) 0.3s forwards;
      }

      /* Hover glow (sutil, opcional, não afeta geometria) */
      .mermaid-wrap .mermaid g.node rect,
      .mermaid-wrap .mermaid g.node polygon,
      .mermaid-wrap .mermaid g.node circle,
      .mermaid-wrap .mermaid g.node ellipse,
      .mermaid-wrap .mermaid g.node path {
        transition: filter 0.4s ease;
      }
      .mermaid-wrap .mermaid g.node:hover rect,
      .mermaid-wrap .mermaid g.node:hover polygon,
      .mermaid-wrap .mermaid g.node:hover circle,
      .mermaid-wrap .mermaid g.node:hover ellipse,
      .mermaid-wrap .mermaid g.node:hover path {
        filter: drop-shadow(0 0 10px rgba(201,139,255,0.65));
        cursor: pointer;
      }

      /* Pulse suave nas pontas de seta */
      @keyframes markerPulse {
        0%, 100% { opacity: 0.85; }
        50%      { opacity: 1; }
      }
      .mermaid-wrap.is-visible .mermaid marker path {
        animation: markerPulse 3.5s ease-in-out infinite;
      }

      /* Tipografia coerente com o documento */
      .mermaid-wrap .mermaid,
      .mermaid-wrap .mermaid foreignObject div,
      .mermaid-wrap .mermaid foreignObject span {
        font-family: var(--font-body) !important;
      }
      .mermaid-wrap .mermaid text,
      .mermaid-wrap .mermaid g.node text,
      .mermaid-wrap .mermaid g.label text,
      .mermaid-wrap .mermaid g.actor text,
      .mermaid-wrap .mermaid .nodeLabel,
      .mermaid-wrap .mermaid .edgeLabel,
      .mermaid-wrap .mermaid .messageText,
      .mermaid-wrap .mermaid .actor,
      .mermaid-wrap .mermaid .cluster text {
        font-family: var(--font-body) !important;
        font-weight: 500;
        font-size: 14px !important;
      }
      .mermaid-wrap .mermaid g.node text,
      .mermaid-wrap .mermaid g.label text,
      .mermaid-wrap .mermaid g.actor text { fill: var(--text) !important; }
      .mermaid-wrap .mermaid .edgeLabel,
      .mermaid-wrap .mermaid .edgeLabel rect { background-color: transparent !important; fill: var(--bg-2) !important; }
      .mermaid-wrap .mermaid .edgeLabel span,
      .mermaid-wrap .mermaid .edgeLabel p { color: var(--text-dim) !important; background: transparent !important; }

      /* ==================== REVEAL ==================== */
      .reveal {
        opacity: 0; transform: translateY(24px);
        transition: opacity 0.7s cubic-bezier(0.2,0.8,0.2,1), transform 0.7s cubic-bezier(0.2,0.8,0.2,1);
        will-change: opacity, transform;
      }
      .reveal.is-visible { opacity: 1; transform: translateY(0); }

      /* ==================== FOOTER ==================== */
      footer {
        background: linear-gradient(180deg, var(--bg-0) 0%, var(--bg-1) 100%);
        border-top: 1px solid var(--line);
        padding: 80px var(--doc-pad-x) 60px;
        text-align: center;
        color: var(--text-muted);
        font-size: 13.5px;
      }
      footer h3 { font-family: var(--font-display); color: var(--text); margin-bottom: 14px; font-size: 22px; }
      footer code { background: rgba(122,162,255,0.12); color: var(--accent); padding: 3px 8px; border-radius: 5px; font-size: 12px; font-family: var(--font-mono); }

      /* ==================== PRINT A3 ==================== */
      @page { size: A3 landscape; margin: 18mm; }
      @media print {
        .progress-bar, .topnav { display: none; }
        .reveal { opacity: 1; transform: none; }
        .mermaid-wrap::before { animation: none; }
        body { background: white; color: black; }
        .doc { color: black; }
        .doc p, .doc li { color: #222; }
      }

      @media (max-width: 900px) {
        :root { --doc-pad-x: 24px; --doc-pad-y: 50px; --prose-max: 100%; }
        .hero { padding: 90px var(--doc-pad-x) 70px; }
      }
    </style>
  </head>
  <body>
    <div class="progress-bar" id="progressBar"></div>

    <nav class="topnav" aria-label="Navegação principal">
      <a href="#guia-de-leitura">Guia</a>
      <a href="#instalacao">Install</a>
      <a href="#como-usar">Uso</a>
      <a href="#comandos">Comandos</a>
      <a href="#gates-de-implementacao">Gates</a>
      <a href="#estrategia-de-prompt-layering-e-tokens">Prompts</a>
      <a href="#modos-de-agente">Modos</a>
      <a href="#matriz-de-maturidade">Maturidade</a>
    </nav>

    <header class="hero">
      <div class="hero-inner">
        <div class="eyebrow"><span class="dot"></span>SpecKit · README HTML · v0.5.0</div>
        <h1>Spec <span class="grad">Driven</span> Development<br />para VS Code.</h1>
        <p class="hero-lead">
          Documentação completa em formato HTML rico — todo o conteúdo do README.md transposto com tipografia justificada,
          margens A3, diagramas Mermaid animados e revelação progressiva por scroll. Tudo continua local, auditável e
          alinhado ao fluxo SDD: cinco gates, atores bem definidos, prompts em camadas, validação determinística e UI
          nativa do VS Code.
        </p>
        <div class="hero-meta">
          <div class="meta-card"><div class="label">Versão</div><div class="value">0.5.0 <small>MINOR</small></div></div>
          <div class="meta-card"><div class="label">Comandos</div><div class="value">15 <small>slash · participant</small></div></div>
          <div class="meta-card"><div class="label">Spec-First</div><div class="value">Validation <small>hook automático</small></div></div>
          <div class="meta-card"><div class="label">Review</div><div class="value">review-auto <small>multi-LLM</small></div></div>
          <div class="meta-card"><div class="label">IDE</div><div class="value">VS Code <small>1.85+</small></div></div>
        </div>
      </div>
    </header>

    <section class="toc-section" id="sumario">
      <div class="toc-inner">
        <div class="toc-title">Sumário · ${tocItems.length} seções</div>
        <div class="toc-grid">
          ${tocHtml}
        </div>
      </div>
    </section>

    <main class="doc">
      ${injected}
    </main>

    <footer>
      <h3>SpecKit · README · v0.5.0</h3>
      <p>Gerado a partir de <code>README.md</code> · Branch <code>feat/v0.5-improvements</code></p>
      <p style="margin-top: 12px;">Para impressão use o diálogo do navegador (Ctrl+P) — o layout está calibrado para <strong>A3 landscape</strong>.</p>
      <p style="margin-top: 14px; font-size: 12px;">Documento gerado em 13/05/2026 · Co-authored-by Copilot</p>
    </footer>

    <script>
      // Progress bar
      (function () {
        var bar = document.getElementById("progressBar");
        if (!bar) return;
        function update() {
          var h = document.documentElement;
          var pct = h.scrollHeight - h.clientHeight > 0 ? (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100 : 0;
          bar.style.width = pct + "%";
        }
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        update();
      })();

      // Mermaid — tema vibrante e linhas mais grossas
      mermaid.initialize({
        startOnLoad: true,
        theme: "dark",
        securityLevel: "loose",
        themeVariables: {
          primaryColor: "#243057",
          primaryTextColor: "#e8ecf6",
          primaryBorderColor: "#7aa2ff",
          lineColor: "#9d7aff",
          secondaryColor: "#1b3a4d",
          tertiaryColor: "#3d2e1a",
          background: "#11172b",
          mainBkg: "#243057",
          secondBkg: "#1b3a4d",
          tertiaryBkg: "#3d2e1a",
          edgeLabelBackground: "#161e36",
          clusterBkg: "#11172b",
          clusterBorder: "#7aa2ff",
          titleColor: "#e8ecf6",
          actorBkg: "#243057",
          actorBorder: "#7aa2ff",
          actorTextColor: "#e8ecf6",
          actorLineColor: "#9d7aff",
          signalColor: "#9d7aff",
          signalTextColor: "#e8ecf6",
          labelBoxBkgColor: "#243057",
          labelBoxBorderColor: "#7aa2ff",
          labelTextColor: "#e8ecf6",
          loopTextColor: "#e8ecf6",
          noteBorderColor: "#ffb454",
          noteBkgColor: "#3d2e1a",
          noteTextColor: "#e8ecf6",
          activationBorderColor: "#4cc9f0",
          activationBkgColor: "#1b3a4d",
          fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        },
        flowchart: { curve: "basis", padding: 22, useMaxWidth: true, htmlLabels: true },
        sequence: { actorMargin: 60, boxMargin: 12, messageMargin: 36, mirrorActors: false },
        state: { sectionFontSize: 14 },
      });

      // Após renderização do Mermaid, ativa via IntersectionObserver para
      // que TODOS os diagramas (não só os do primeiro viewport) recebam
      // is-visible quando entrarem em cena. Fallback: ativa todos.
      function observeDiagrams() {
        var wraps = document.querySelectorAll(".mermaid-wrap");
        if (!("IntersectionObserver" in window)) {
          wraps.forEach(function (w) { w.classList.add("is-visible"); });
          return;
        }
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              e.target.classList.add("is-visible");
              io.unobserve(e.target);
            }
          });
        }, { threshold: 0.05, rootMargin: "0px 0px -40px 0px" });
        wraps.forEach(function (w) { io.observe(w); });
      }
      // Mermaid v10 renderiza após DOMContentLoaded; damos um tempo curto e observamos.
      // Em qualquer falha do observer, fallback de segurança após 3s ativa tudo.
      setTimeout(observeDiagrams, 600);
      setTimeout(function () {
        document.querySelectorAll(".mermaid-wrap:not(.is-visible)").forEach(function (w) {
          w.classList.add("is-visible");
        });
      }, 3500);

      // Scroll reveal
      (function () {
        var els = document.querySelectorAll(".reveal");
        if (!("IntersectionObserver" in window)) {
          els.forEach(function (el) { el.classList.add("is-visible"); });
          return;
        }
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              e.target.classList.add("is-visible");
              io.unobserve(e.target);
            }
          });
        }, { threshold: 0.08, rootMargin: "0px 0px -60px 0px" });
        els.forEach(function (el) { io.observe(el); });
      })();
    </script>
  </body>
</html>`;

const outPath = path.join(root, "publish/0.5.0/README-0.5.0.html");
fs.writeFileSync(outPath, html, "utf8");
console.log("Generated:", outPath, fs.statSync(outPath).size, "bytes");
