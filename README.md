# SpecKit — Spec Driven Development

Plugin para VS Code que implementa o fluxo de **Spec Driven Development (SDD)**: você define uma História estruturada (nova feature) ou um Fix estruturado (correção de bug) antes de escrever código, e o plugin gera automaticamente os arquivos de configuração do GitHub Copilot que "primam" a sessão com todo o contexto do projeto.

O Copilot passa a conhecer o requisito de negócio, critérios de aceite, restrições não-funcionais, stack técnica, padrão arquitetural, regras de teste e convenções de versionamento — antes de qualquer conversa começar.

---

## Pré-requisitos

- VS Code `^1.93.0`
- Extensão **GitHub Copilot Chat** instalada e ativa

---

## Instalação

1. Faça o download do arquivo `.vsix` mais recente
2. No VS Code, abra a paleta de comandos (`Ctrl+Shift+P`)
3. Execute **"Extensions: Install from VSIX..."**
4. Selecione o arquivo `.vsix`

---

## Como usar

O SpecKit expõe um **Chat Participant** chamado `@speckit`. Todo o fluxo acontece no Copilot Chat.

### Fluxo — Nova Feature (História)

```
@speckit /new          →  Cria o template da História e abre no editor
                       ↓
               Preencha a História (parcial ou completa)
                       ↓
┌──────────────────────────────────────────────────────┐
│  Opção A — via /validate                             │
│                                                      │
│  @speckit /validate                                  │
│     ↓ história com lacunas?                          │
│     Agente pergunta uma lacuna por vez               │
│     e atualiza o arquivo da história                 │
│     → @speckit /validate novamente                   │
│     ↓ DoR atingido                                   │
│     Gera todos os arquivos .github/                  │
│     → "Abra o Copilot Chat em modo Agente            │
│        e digite /implement"                          │
│                                                      │
│  Copilot Chat — modo Agente                          │
│     /implement                                       │
│     Agente apresenta plano · usuário confirma        │
│     SESSÃO A: Agente implementa + testa              │
│     → Agente diz: "execute @speckit /review"         │
│                                                      │
│  @speckit /review                                    │
│     → "Abra novo Copilot Chat em modo Agente         │
│        e digite /review"                             │
│                                                      │
│  Copilot Chat — modo Agente (nova sessão)            │
│     /review                                          │
│     SESSÃO B: Agente revisa + entrega                │
└──────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────┐
│  Opção B — via /apply                                │
│                                                      │
│  @speckit /apply                                     │
│     ↓ gera todos os arquivos .github/                │
│     → "Abra o Copilot Chat em modo Agente            │
│        e digite /implement"                          │
│  (mesmo fluxo de Sessão A → B da Opção A)            │
└──────────────────────────────────────────────────────┘
```

### Fluxo — Correção de Bug (Fix)

```
@speckit /fix          →  Cria o template do Fix e abre no editor
                       ↓
               Preencha o Fix (bug, hipótese, impacto, testes)
               A stack técnica é detectada automaticamente
                       ↓
    @speckit /validate
       ↓ fix com lacunas?
       Agente pergunta uma lacuna por vez e atualiza o arquivo
       → @speckit /validate novamente
       ↓ Fix válido
       Stack detectada → gera todos os arquivos .github/
       → "Abra o Copilot Chat em modo Agente
          e digite /fix-implement"
                       ↓
    Copilot Chat — modo Agente
       /fix-implement
       SESSÃO A: investigação → root cause confirmada → fix → testes de regressão
       → Agente diz: "execute @speckit /review"
                       ↓
    @speckit /review
       → "Abra novo Copilot Chat em modo Agente
          e digite /fix-review"
                       ↓
    Copilot Chat — modo Agente (nova sessão)
       /fix-review
       SESSÃO B: revisão independente + encerramento do fix
```

---

## Comandos

### `@speckit /new`

Cria o arquivo `.speckit/STORY-XXX.md` (numeração automática) e abre no editor.

| Seção | O que preencher |
|---|---|
| Requisito de Negócio | Problema, valor de negócio, stakeholders |
| Especificação Funcional | User stories, critérios de aceite, fora de escopo |
| Especificação Não-Funcional | Performance, segurança, escalabilidade, usabilidade, disponibilidade |
| Especificação Técnica | Linguagem, framework, arquitetura, target, banco, infra |
| DoR | Marcar com `[x]` os critérios já atendidos |
| DoD | Critérios de conclusão |

**Linguagens suportadas:** `typescript` · `javascript` · `java` · `csharp` · `python`

**Frameworks suportados:** `dotnet` · `springboot` · `angular` · `react` · `fastapi` · `other`

**Arquiteturas suportadas:** `hexagonal` · `layered` · `microservices` · `monolith` · `serverless`

---

### `@speckit /fix`

Cria o arquivo `.speckit/FIX-XXX.md` (numeração automática) e abre no editor.

| Seção | O que preencher |
|---|---|
| Bug Description | Título, sintomas, passos para reproduzir, ambiente, frequência |
| Root Cause Hypothesis | Hipótese da causa raiz, arquivos/componentes suspeitos |
| Impact Assessment | Severidade (`critical` · `high` · `medium` · `low`), usuários/sistemas afetados, risco de regressão |
| Regression Prevention | Testes a adicionar para prevenir regressão |
| DoF | Critérios de Definition of Fixed |

> **Stack técnica detectada automaticamente** a partir do workspace — não é necessário especificá-la no arquivo.

---

### `@speckit /validate`

Detecta automaticamente o tipo da spec ativa em `.speckit/` (Story ou Fix) e valida campos obrigatórios.

- **Se houver lacunas:** injeta no chat um prompt de alinhamento — o Copilot pergunta uma lacuna por vez e atualiza o arquivo. Quando tudo estiver preenchido, orienta a executar `/validate` novamente.
- **Se válida (Story):** gera todos os arquivos `.github/` e instrui a abrir o Copilot Chat em modo **Agente** e digitar `/implement`.
- **Se válida (Fix):** detecta a stack do workspace, gera todos os arquivos `.github/` e instrui a abrir o Copilot Chat em modo **Agente** e digitar `/fix-implement`.

---

### `@speckit /apply`

Valida a Story e, se estiver completa, gera todos os arquivos de configuração do Copilot.

> Para Fixes, use `/validate` — o `/apply` é exclusivo para Stories.

---

### `@speckit /review`

Inicia a **Sessão B** — revisão independente e entrega.

Execute quando o agente da Sessão A instruir com *"Execute `@speckit /review`"*. O comando instrui a abrir um novo Copilot Chat em modo **Agente** e digitar `/review` (Stories) ou `/fix-review` (Fixes).

> **Por que duas sessões?** O agente que implementou o código tem viés ao revisá-lo (anchoring bias). A Sessão B começa sem memória da implementação, garantindo uma revisão genuinamente independente.

---

### `@speckit /status`

Exibe um resumo de todas as specs abertas no workspace:

- **Stories abertas:** título, linguagem, framework, arquitetura e status de validação (✅ DoR atingido / ⚠️ lacunas)
- **Fixes abertos:** título e severidade (🐛 critical / high / medium / low)

Specs com `status: done` são ocultadas automaticamente.

---

## Arquivos gerados

### Stories

```
.github/
├── copilot-instructions.md
├── prompts/
│   ├── implement.prompt.md       # Sessão A — /implement
│   ├── review.prompt.md          # Sessão B — /review
│   └── run.prompt.md             # Sessão única — /run
└── instructions/
    ├── 00-agent-integrity.instructions.md
    ├── 01-performance.instructions.md
    ├── 02-architecture.instructions.md
    ├── 03-context-management.instructions.md
    ├── 04-testing-standards.instructions.md
    ├── 05-git-workflow.instructions.md
    ├── lang-<linguagem>.instructions.md
    ├── fw-<framework>.instructions.md
    ├── 10-business-context.instructions.md
    ├── 11-functional-spec.instructions.md
    ├── 12-nonfunctional-spec.instructions.md
    ├── 13-tech-stack.instructions.md
    ├── 14-architecture-pattern.instructions.md
    └── 15-dod-checklist.instructions.md
```

### Fixes

```
.github/
├── copilot-instructions.md
├── prompts/
│   ├── fix-implement.prompt.md   # Sessão A — /fix-implement
│   ├── fix-review.prompt.md      # Sessão B — /fix-review
│   └── fix-run.prompt.md         # Sessão única — /fix-run
└── instructions/
    ├── 00-agent-integrity.instructions.md
    ├── 01-performance.instructions.md
    ├── 02-architecture.instructions.md
    ├── 03-context-management.instructions.md
    ├── 04-testing-standards.instructions.md
    ├── 05-git-workflow.instructions.md
    ├── lang-<linguagem>.instructions.md
    ├── fw-<framework>.instructions.md
    ├── 10-fix-context.instructions.md
    ├── 11-root-cause.instructions.md
    ├── 12-fix-impact.instructions.md
    ├── 13-regression-prevention.instructions.md
    └── 14-fix-dof.instructions.md
```
