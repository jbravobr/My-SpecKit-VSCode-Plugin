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
md.renderer.rules.fence = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const info = (token.info || "").trim();
  if (info === "mermaid") {
    return `<div class="mermaid-wrap reveal"><pre class="mermaid">${token.content}</pre></div>\n`;
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
    classDef g0 fill:#1c2541,stroke:#7aa2ff,color:#e8ecf6
    classDef g1 fill:#1c2541,stroke:#9d7aff,color:#e8ecf6
    classDef g2 fill:#1c2541,stroke:#4cc9f0,color:#e8ecf6
    classDef g3 fill:#1c2541,stroke:#ffb454,color:#e8ecf6
    classDef g4 fill:#1c2541,stroke:#38d39f,color:#e8ecf6`,
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
    classDef a fill:#1c2541,stroke:#7aa2ff,color:#e8ecf6
    classDef b fill:#1c2541,stroke:#9d7aff,color:#e8ecf6
    classDef c fill:#1c2541,stroke:#4cc9f0,color:#e8ecf6
    classDef d fill:#1c2541,stroke:#ffb454,color:#e8ecf6
    classDef e fill:#1c2541,stroke:#58e1c2,color:#e8ecf6
    classDef out fill:#243057,stroke:#c98bff,color:#e8ecf6,font-weight:bold`,
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
        H1[heuristic]
        T1[typecheck]
    end
    subgraph G2[Gate 2]
        T2[typecheck]
        A2[ac-presence]
        S2[secret-leak]
    end
    subgraph G3[Gate 3]
        A3[ac-presence]
        TE3[test-execution]
        C3[coverage]
        CR3[crap]
        S3[secret-leak]
    end
    G1 --> G2 --> G3
    style G1 fill:#11172b,stroke:#7aa2ff
    style G2 fill:#11172b,stroke:#4cc9f0
    style G3 fill:#11172b,stroke:#ffb454`,
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
    classDef s fill:#1c2541,stroke:#58e1c2,color:#e8ecf6
    classDef c fill:#1c2541,stroke:#7aa2ff,color:#e8ecf6
    classDef t fill:#1c2541,stroke:#9d7aff,color:#e8ecf6
    classDef e fill:#1c2541,stroke:#ffb454,color:#e8ecf6
    classDef m fill:#1c2541,stroke:#4cc9f0,color:#e8ecf6
    classDef a fill:#243057,stroke:#c98bff,color:#e8ecf6,font-weight:bold`,
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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
    <style>
      :root {
        --bg-0: #0b1020;
        --bg-1: #11172b;
        --bg-2: #161e36;
        --surface: #1c2541;
        --surface-2: #243057;
        --line: #2a3760;
        --text: #e8ecf6;
        --text-dim: #b0b9d4;
        --text-muted: #7c87a9;
        --accent: #7aa2ff;
        --accent-2: #9d7aff;
        --user: #58e1c2;
        --participant: #ffb454;
        --llm: #c98bff;
        --success: #38d39f;
        --warn: #ffb454;
        --danger: #ff6b8a;
        --gate: #4cc9f0;
        --gradient-hero: linear-gradient(135deg, #0b1020 0%, #1a1d4d 50%, #2a1d5d 100%);
        --gradient-accent: linear-gradient(135deg, #7aa2ff 0%, #9d7aff 100%);
        --gradient-success: linear-gradient(135deg, #38d39f 0%, #4cc9f0 100%);
        --gradient-aurora: linear-gradient(120deg, #7aa2ff, #9d7aff, #58e1c2, #ffb454, #c98bff);
        /* A3 landscape: 1587px @ 96dpi. Margins generosas. */
        --doc-max: 1480px;
        --doc-pad-x: 80px;
        --doc-pad-y: 90px;
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }
      html { scroll-behavior: smooth; }
      body {
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg-0);
        color: var(--text);
        line-height: 1.72;
        -webkit-font-smoothing: antialiased;
        overflow-x: hidden;
      }
      code, pre, .mono { font-family: "JetBrains Mono", "Consolas", monospace; }

      /* ==================== ANIMAÇÕES BASE ==================== */
      @keyframes fadeUp { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes pulseDot {
        0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 12px var(--success); }
        50% { opacity: 0.55; transform: scale(1.35); box-shadow: 0 0 22px var(--success); }
      }
      @keyframes auroraShift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
      }
      @keyframes shimmer {
        0% { background-position: -1000px 0; }
        100% { background-position: 1000px 0; }
      }
      @keyframes drawLine {
        from { stroke-dashoffset: 1200; }
        to { stroke-dashoffset: 0; }
      }
      @keyframes fadeNode {
        from { opacity: 0; transform: scale(0.85); }
        to { opacity: 1; transform: scale(1); }
      }
      @keyframes orbit {
        from { transform: rotate(0deg) translateX(160px) rotate(0deg); }
        to { transform: rotate(360deg) translateX(160px) rotate(-360deg); }
      }
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
        position: fixed; top: 14px; right: 18px;
        z-index: 999;
        background: rgba(17,23,43,0.78);
        backdrop-filter: blur(14px);
        border: 1px solid var(--line);
        border-radius: 100px;
        padding: 8px 14px;
        display: flex; gap: 4px;
        font-size: 12px; font-weight: 600;
        animation: fadeIn 0.8s ease 0.3s backwards;
      }
      .topnav a {
        color: var(--text-dim);
        text-decoration: none;
        padding: 6px 12px;
        border-radius: 100px;
        transition: all 0.25s;
      }
      .topnav a:hover { color: var(--text); background: rgba(122,162,255,0.15); transform: translateY(-1px); }
      @media (max-width: 1100px) { .topnav { display: none; } }

      /* ==================== HERO ==================== */
      .hero {
        background: var(--gradient-hero);
        padding: 150px var(--doc-pad-x) 120px;
        position: relative;
        overflow: hidden;
        border-bottom: 1px solid var(--line);
      }
      .hero::before {
        content: ""; position: absolute;
        top: -50%; left: -10%;
        width: 60%; height: 200%;
        background: radial-gradient(circle, rgba(157,122,255,0.20) 0%, transparent 70%);
        pointer-events: none;
        animation: float 8s ease-in-out infinite;
      }
      .hero::after {
        content: ""; position: absolute;
        bottom: -50%; right: -10%;
        width: 60%; height: 200%;
        background: radial-gradient(circle, rgba(122,162,255,0.18) 0%, transparent 70%);
        pointer-events: none;
        animation: float 9s ease-in-out infinite reverse;
      }
      .hero-inner { max-width: var(--doc-max); margin: 0 auto; position: relative; z-index: 1; }
      .eyebrow {
        display: inline-flex; align-items: center; gap: 10px;
        padding: 8px 18px;
        background: rgba(122,162,255,0.12);
        border: 1px solid rgba(122,162,255,0.35);
        border-radius: 100px;
        font-size: 13px; font-weight: 600;
        color: var(--accent);
        letter-spacing: 0.08em; text-transform: uppercase;
        margin-bottom: 28px;
        animation: fadeUp 0.7s ease;
      }
      .eyebrow .dot {
        width: 8px; height: 8px;
        background: var(--success);
        border-radius: 50%;
        animation: pulseDot 2s ease-in-out infinite;
      }
      .hero h1 {
        font-size: clamp(40px, 6vw, 78px);
        font-weight: 800; line-height: 1.05;
        letter-spacing: -0.025em;
        background: linear-gradient(135deg, #ffffff 0%, #b0b9d4 100%);
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 26px;
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
        font-size: clamp(17px, 1.6vw, 22px);
        color: var(--text-dim);
        margin-bottom: 56px; font-weight: 400;
        text-align: justify; hyphens: auto;
        max-width: 1200px;
        animation: fadeUp 1s ease 0.25s backwards;
      }
      .hero-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
        animation: fadeUp 1s ease 0.4s backwards;
      }
      .meta-card {
        background: rgba(28,37,65,0.6);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 18px 20px;
        backdrop-filter: blur(8px);
        transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.3s ease, box-shadow 0.3s ease;
      }
      .meta-card:hover {
        transform: translateY(-4px);
        border-color: var(--accent);
        box-shadow: 0 12px 28px rgba(122,162,255,0.18);
      }
      .meta-card .label { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 8px; }
      .meta-card .value { font-size: 22px; font-weight: 700; color: var(--text); }
      .meta-card .value small { font-size: 13px; color: var(--text-dim); font-weight: 500; margin-left: 4px; }

      /* ==================== TOC ==================== */
      .toc-section { padding: var(--doc-pad-y) var(--doc-pad-x); background: var(--bg-1); border-bottom: 1px solid var(--line); }
      .toc-inner { max-width: var(--doc-max); margin: 0 auto; }
      .toc-title { font-size: 12px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); margin-bottom: 24px; }
      .toc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
      .toc-item {
        display: flex; align-items: center; gap: 12px;
        padding: 14px 18px;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 12px;
        color: var(--text-dim);
        text-decoration: none;
        font-size: 14px; font-weight: 500;
        transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        animation: fadeUp 0.5s ease backwards;
        animation-delay: calc(var(--i, 0) * 40ms);
      }
      .toc-item:hover { transform: translateX(4px); border-color: var(--accent); color: var(--text); }
      .toc-num { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--accent); font-weight: 700; }
      .toc-text { flex: 1; }

      /* ==================== DOC CONTENT ==================== */
      .doc {
        max-width: var(--doc-max);
        margin: 0 auto;
        padding: var(--doc-pad-y) var(--doc-pad-x);
        position: relative;
      }
      .doc h1, .doc h2, .doc h3, .doc h4, .doc p, .doc li, .doc blockquote {
        text-align: justify;
        text-justify: inter-word;
        hyphens: auto;
        -webkit-hyphens: auto;
        word-break: keep-all;
        overflow-wrap: break-word;
      }
      .doc h1 {
        font-size: clamp(30px, 4vw, 52px);
        font-weight: 800; line-height: 1.12; letter-spacing: -0.02em;
        margin: 70px 0 26px;
        background: linear-gradient(135deg, #ffffff 0%, #b0b9d4 100%);
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
        text-align: left;
      }
      .doc h1:first-child { margin-top: 0; }
      .doc h2 {
        font-size: clamp(24px, 2.6vw, 36px);
        font-weight: 800; line-height: 1.2; letter-spacing: -0.015em;
        margin: 70px 0 22px;
        color: var(--text);
        padding-left: 18px;
        border-left: 4px solid transparent;
        border-image: var(--gradient-accent) 1;
        text-align: left;
      }
      .doc h3 {
        font-size: 22px; font-weight: 700; margin: 40px 0 14px; color: var(--accent);
        text-align: left;
      }
      .doc h4 {
        font-size: 17px; font-weight: 700; margin: 26px 0 10px; color: var(--accent-2);
        text-align: left;
      }
      .doc p { margin: 14px 0; color: var(--text-dim); font-size: 16px; }
      .doc strong { color: var(--text); font-weight: 600; }
      .doc em { color: var(--text); font-style: italic; }
      .doc a { color: var(--accent); text-decoration: none; border-bottom: 1px dashed rgba(122,162,255,0.4); transition: all 0.2s; }
      .doc a:hover { color: var(--accent-2); border-bottom-color: var(--accent-2); }
      .doc ul, .doc ol { margin: 14px 0 18px 28px; color: var(--text-dim); }
      .doc li { margin-bottom: 8px; font-size: 16px; }
      .doc li::marker { color: var(--accent); }
      .doc hr {
        border: none;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--line) 20%, var(--line) 80%, transparent);
        margin: 50px 0;
      }
      .doc code:not(pre code) {
        background: rgba(122,162,255,0.12);
        color: var(--accent);
        padding: 2px 7px;
        border-radius: 5px;
        font-size: 0.9em;
        border: 1px solid rgba(122,162,255,0.18);
      }
      .doc pre {
        background: #0a0f1f;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 20px 22px;
        margin: 18px 0 26px;
        overflow-x: auto;
        font-size: 13px;
        line-height: 1.65;
        color: #d4dbef;
        position: relative;
      }
      .doc pre::before {
        content: "";
        position: absolute;
        top: 0; left: 0; right: 0; height: 2px;
        background: var(--gradient-accent);
        opacity: 0.6;
      }
      .doc pre code { color: #d4dbef; font-size: 13px; }
      .doc blockquote.callout {
        background: rgba(122,162,255,0.06);
        border-left: 4px solid var(--accent);
        border-radius: 8px;
        padding: 16px 22px;
        margin: 20px 0 26px;
        color: var(--text-dim);
        font-size: 15px;
      }
      .doc blockquote.callout p { margin: 6px 0; }

      /* ==================== TABLE ==================== */
      .table-wrap {
        overflow-x: auto;
        margin: 18px 0 28px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: var(--surface);
        box-shadow: var(--shadow-md, 0 8px 24px rgba(0,0,0,0.25));
      }
      .doc table { width: 100%; border-collapse: collapse; font-size: 14px; }
      .doc thead { background: var(--surface-2); }
      .doc th, .doc td {
        text-align: left;
        padding: 14px 18px;
        border-bottom: 1px solid var(--line);
        color: var(--text-dim);
      }
      .doc th { color: var(--text); font-weight: 700; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; }
      .doc tbody tr { transition: background 0.2s; }
      .doc tbody tr:hover { background: rgba(122,162,255,0.05); }
      .doc tbody tr:last-child td { border-bottom: none; }

      /* ==================== MERMAID ==================== */
      .diagram-figure { margin: 32px 0 40px; }
      .diagram-caption {
        font-size: 12px; font-weight: 700; letter-spacing: 0.16em;
        text-transform: uppercase; color: var(--accent);
        margin-bottom: 14px; text-align: left;
      }
      .mermaid-wrap {
        background: var(--bg-2);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 36px 30px;
        margin: 18px 0 32px;
        text-align: center;
        overflow-x: auto;
        position: relative;
      }
      .mermaid-wrap::before {
        content: ""; position: absolute; inset: 0;
        background: linear-gradient(90deg, transparent, rgba(122,162,255,0.06), transparent);
        background-size: 1000px 100%;
        animation: shimmer 6s linear infinite;
        pointer-events: none; border-radius: 16px;
      }
      .mermaid { font-family: "Inter", sans-serif !important; position: relative; z-index: 1; }
      .mermaid svg { max-width: 100%; height: auto !important; }
      /* Animação: draw das linhas + fade dos nós quando aparecem no viewport */
      .mermaid-wrap.is-visible .mermaid g.node,
      .mermaid-wrap.is-visible .mermaid g.actor {
        animation: fadeNode 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
      }
      .mermaid-wrap.is-visible .mermaid g.node:nth-child(1) { animation-delay: 0.05s; }
      .mermaid-wrap.is-visible .mermaid g.node:nth-child(2) { animation-delay: 0.15s; }
      .mermaid-wrap.is-visible .mermaid g.node:nth-child(3) { animation-delay: 0.25s; }
      .mermaid-wrap.is-visible .mermaid g.node:nth-child(4) { animation-delay: 0.35s; }
      .mermaid-wrap.is-visible .mermaid g.node:nth-child(5) { animation-delay: 0.45s; }
      .mermaid-wrap.is-visible .mermaid g.node:nth-child(n+6) { animation-delay: 0.55s; }
      .mermaid-wrap.is-visible .mermaid .flowchart-link,
      .mermaid-wrap.is-visible .mermaid path.transition,
      .mermaid-wrap.is-visible .mermaid .messageLine0,
      .mermaid-wrap.is-visible .mermaid .messageLine1 {
        stroke-dasharray: 1200;
        stroke-dashoffset: 1200;
        animation: drawLine 1.4s cubic-bezier(0.2, 0.8, 0.2, 1) 0.4s forwards;
      }
      .mermaid g.node:hover { filter: brightness(1.25) drop-shadow(0 0 12px rgba(122,162,255,0.6)); cursor: pointer; transition: filter 0.25s ease; }

      /* ==================== REVEAL ON SCROLL ==================== */
      .reveal {
        opacity: 0;
        transform: translateY(24px);
        transition: opacity 0.65s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.65s cubic-bezier(0.2, 0.8, 0.2, 1);
        will-change: opacity, transform;
      }
      .reveal.is-visible { opacity: 1; transform: translateY(0); }

      /* ==================== FOOTER ==================== */
      footer {
        background: var(--bg-1);
        border-top: 1px solid var(--line);
        padding: 70px var(--doc-pad-x) 50px;
        text-align: center;
        color: var(--text-muted);
        font-size: 13px;
      }
      footer h3 { color: var(--text); margin-bottom: 14px; font-size: 18px; }
      footer code { background: rgba(122,162,255,0.1); color: var(--accent); padding: 2px 7px; border-radius: 5px; font-size: 12px; }

      /* ==================== PRINT (A3 landscape) ==================== */
      @page { size: A3 landscape; margin: 18mm; }
      @media print {
        .progress-bar, .topnav { display: none; }
        .reveal { opacity: 1; transform: none; }
        .mermaid-wrap::before { animation: none; }
      }

      @media (max-width: 900px) {
        :root { --doc-pad-x: 24px; --doc-pad-y: 50px; }
        .hero { padding: 90px var(--doc-pad-x) 70px; }
        .doc h1 { font-size: 32px; }
        .doc h2 { font-size: 24px; }
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
          <div class="meta-card"><div class="label">Layout</div><div class="value">A3 <small>landscape</small></div></div>
          <div class="meta-card"><div class="label">Texto</div><div class="value">Justificado</div></div>
          <div class="meta-card"><div class="label">Diagramas</div><div class="value">Mermaid <small>animado</small></div></div>
          <div class="meta-card"><div class="label">Capítulos</div><div class="value">${tocItems.length}</div></div>
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

      // Mermaid
      mermaid.initialize({
        startOnLoad: true,
        theme: "dark",
        securityLevel: "loose",
        themeVariables: {
          primaryColor: "#243057",
          primaryTextColor: "#e8ecf6",
          primaryBorderColor: "#7aa2ff",
          lineColor: "#7aa2ff",
          secondaryColor: "#1c2541",
          tertiaryColor: "#11172b",
          background: "#11172b",
          fontFamily: "Inter, sans-serif",
        },
        flowchart: { curve: "basis", padding: 20, useMaxWidth: true },
        sequence: { actorMargin: 60, boxMargin: 12, messageMargin: 36 },
        state: { sectionFontSize: 14 },
      });

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
