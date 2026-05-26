# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adere a [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.8.0] — Impact Analysis, Retrospective, ADR Auto-Record & Pre-Gate Dry-Run

### Adicionado

- **Comando `/impact`** — Análise de blast radius via `GraphQuery.neighbors()` + `riskScore()`. Mostra nós afetados, risk score normalizado [0..100] e sugestão de testes para nós de alto risco.
- **Comando `/retrospective`** — Feedback loop fechado que analisa histórico local (`audit`, `trace`, `metrics`, evidências e contadores de iteração) e expõe padrões recorrentes, gates com maior regressão e recomendações acionáveis.
- **`DecisionRecorder`** — Gera ADRs automáticos em `.speckit/decisions/` com numeração incremental, slug previsível e serialização segura de gravações concorrentes.
- **`DecisionDetector`** — Identifica decisões conservadoras de descarte de alternativa, regressão de gate, troca de modo e breaking change nos fluxos existentes.
- **`GraphAutoBuilder`** — Garante, em silêncio, que `.speckit/graph.json` exista e seja reconstruído quando estiver ausente ou stale. Degradação graciosa em falhas de build.
- **`PreGateDryRunner`** — Hook pré-gate que roda todos os validators antes do `/review-auto` sem efeitos colaterais. Bloqueia avanço se houver findings `blocker` ou `error`. Opt-out via `--skip-dry-run`.
- **`RetrospectiveAnalyzer`** — Motor de análise que computa média de iterações por gate, findings recorrentes, gates que mais regridem e gera recomendações.

### Mudado

- `/review-auto` agora executa dry-run de validators antes de prosseguir (skip com `--skip-dry-run`).
- `/review-auto`, `/validate`, `/agent` e `/commit` agora disparam hooks best-effort de captura de decisão sem bloquear o fluxo principal.
- `GraphRuntime` expõe `ensureGraph()` como entry point para comandos que precisam autoaquecer o grafo sem propagar exceções.
- `GraphStore` agora aceita `IFileSystem` opcional para reutilizar persistência/versionamento com file system injetável em runtime e testes.

## [0.7.0] — Graph Navigation Mandate

### Adicionado

#### Mandato de navegação estrutural por grafo (arXiv 2602.20048v1 + graphify)

Toda implementação, refatoração ou alteração em código existente passa a exigir consulta a um **grafo de dependências do workspace** antes da entrega.

- **`GraphNavigationGenerator`** — fonte da verdade do mandato. Bloco completo injetado em `REFERENCE-graph.md` (progressive disclosure) e referência sempre-ligada no `SKILL.md` do `speckit-baseline`.
- **Injeção em todos os geradores de skills/agents**: `BaselineSkillGenerator`, `StackSkillGenerator`, `StoryContextSkillGenerator`, `FixContextSkillGenerator`, `HandoffSkillGenerator`, `DevToolsSkillGenerator`, `FixImplementador`, `FixRevisor`, `StoryImplementador`, `StoryRevisor`, `StoryUnifiedAgentGenerator`.

#### Infraestrutura de grafo (`src/graph/`)

- **`GraphStore`** — persistência versionada (`schemaVersion 1.0.0`) em `.speckit/graph.json` com `meta.perFileHash`, `meta.perFileMtime`, `meta.headSha` e `meta.partialLanguages`.
- **`GraphifyDetector`** — detecção de instalação externa do [`graphify`](https://github.com/safishamsi/graphify) em 4 caminhos.
- **Extractors de import** — AST-based para TypeScript/JavaScript (lib `typescript`), regex AST-aware para Python/Java/C# (`partial: true`, `confidence: INFERRED|AMBIGUOUS`).
- **`GraphFreshnessGate`** — verificação sync ≤300ms antes de cada comando do participant, fallback async em background quando stale, no-op em greenfield.
- **`GraphQuery`** — `neighbors(entities, {topN, hops})`, `riskScore(nodeId)` normalizado [0..100], `topRiskNodes(n)` com ordenação determinística.
- **`IncrementalUpdater`** — debounce 500ms, `buildFull()`, `flush()`, `refreshFromGitDiff(prev, head)` com budget de performance no flush completo.
- **`BatchContext`** — coalescing de rajadas de extração com janela curta configurável e paralelismo limitado, para reduzir CPU durante checkout/rebase.
- **`PerfBudget`** — medição leve (`performance.now()`) para `graph.gate.ensure`, `graph.updater.flush` e `graph.embedder.generate`, com warning quando excede budget.
- **`SubgraphEmbedder`** — gera bloco `## GRAPH CONTEXT` markdown injetado no `copilot-instructions.md` (lido automaticamente pelo Copilot Chat, sem premium request).

#### Eventos VS Code (Anel 1)

- **`FileSystemWatcherBridge`** — 1 watcher por linguagem suportada com filtro de ignore-glob.
- **`PostSaveCoordinator`** — 1 listener `onDidSaveTextDocument` → grafo (500ms) + CRAP (2000ms) sem duplicação.
- **`HeadFileWatcher`** — observa `.git/HEAD` e `.git/refs/heads/**`, dispara `refreshFromGitDiff` em mudança de SHA.
- **`extension.ts activate()`** — cria `GraphRuntime` único via factory, registra em `context.subscriptions`.

#### Participant gate (Anel 2)

- `speckitParticipant` chama `GraphFreshnessGate.ensure()` antes de qualquer subcomando (`/init`, `/story-impl`, `/fix-impl`, `/validate`, `/review-auto`, `/handoff`, `/doctor`).
- Status `stale-async` emite warning markdown `GRAPH_STALE_WARNING` sem bloquear execução.

#### Comandos novos

- `speckit.graph.rebuild` — reconstrói o grafo do zero.
- `speckit.graph.show` — abre `.speckit/graph.json` no editor.
- `speckit.graph.inspect` — QuickPick → markdown com vizinhos do arquivo.
- `speckit.graph.installGuardrails` — instala SKILL/REFERENCE em `~/.copilot/skills/`, `~/.claude/skills/`, `~/.cursor/rules/` (dry-run + confirmação).
- `/init` gera `.vscode/tasks.json` com tasks "SpecKit: Rebuild/Show Graph".

#### Veto Protocol e evidência (Anel 3)

- **`GraphVetoGenerator`** — seção obrigatória em `/validate` e `/review-auto` exigindo declaração `CONSULTEI` ou `VETO_GRAPH_NOT_AVAILABLE`.
- **`GraphInspectionEvidence`** — JSON estruturado em `.speckit/evidence/graph-inspection.json` (não heading Markdown frágil). Validador refactor checa `consultedEntities` ou `veto`.
- `/doctor` ganha 4 checks: graph build, graph fresh, graphify externo, guardrails user-space.

#### Configurações novas em `package.json`

| Setting                                    | Default  | Descrição                                                                                 |
| ------------------------------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `speckit.graph.enabled`                    | `true`   | Habilita/desabilita o mandato em todo o fluxo                                             |
| `speckit.graph.gate.budgetMs`              | `300`    | Orçamento do sync path do gate antes de fallback async                                    |
| `speckit.graph.updater.flush.budgetMs`     | `2000`   | Orçamento de performance do flush incremental completo                                    |
| `speckit.graph.embedder.generate.budgetMs` | `50`     | Orçamento de geração do bloco markdown `GRAPH CONTEXT`                                    |
| `speckit.graph.batch.windowMs`             | `100`    | Janela curta para coalescer rajadas de extração                                           |
| `speckit.graph.batch.concurrency`          | `4`      | Paralelismo máximo de extração por lote                                                   |
| `speckit.graph.embed.topN`                 | `20`     | Quantidade de nós listados no bloco GRAPH CONTEXT                                         |
| `speckit.graph.embed.attributes`           | `[]`     | Opt-in para atributos extras (`confidence`, `riskScore`, `edgeKind`, `diffSinceLastGate`) |
| `speckit.graph.languages`                  | `"auto"` | Filtro de linguagens (`auto` ou lista)                                                    |
| `speckit.graph.ignore`                     | `[]`     | Globs adicionais ignorados pelo watcher                                                   |

#### Opt-in: atributos extras (Opção 3)

Habilite por `speckit.graph.embed.attributes`:

- `"confidence"` — anota arestas com `EXTRACTED|INFERRED|AMBIGUOUS` (padrão graphify).
- `"riskScore"` — anota nós com score normalizado.
- `"edgeKind"` — anota tipo de aresta (`IMPORTS|INHERITS|INSTANTIATES`).
- `"diffSinceLastGate"` — exibe HEAD vs último SHA navegado.

Default minimal: ~440 tokens. Opção 3 completa: ~570-730 tokens (ainda <1% da janela de 200k).

### Mudado

- `BaselineSkillGenerator`: nova linha no gate-imperative ("Implementar/alterar/refatorar código em repositório carregado → REFERENCE-graph.md") e novo REFERENCE-graph.md emitido. SKILL.md mantém budget ≤ 220 linhas.
- Skills geradas pelo mandato de grafo agora preservam o conhecimento do Veto Protocol sem gerar metadados inválidos: `speckit-graph/SKILL.md` instalado em user-space passa a ter frontmatter `name/description`, referências auxiliares deixam de carregar `applyTo`, `speckit-devtools` ganha `name`, e comandos de grafo não registrados passam a exigir fallback verificável em vez de obrigação impossível.
- Fluxos com confirmação por intent agora exibem linguagem acessível de **código de confirmação** em `/review-auto`, `/status --fix`, `/agent`, `/batch`, Core Server, helps e agentes gerados; o `Intent-ID` continua presente para auditoria, mas o usuário vê claramente o que muda, o que não muda sem confirmação, validade e comando/botão de ação.
- `IndexGenerator` (`copilot-instructions.md`) e `CopilotConfigGenerator`: aceitam `graphBlock` opcional como último bloco (checklist-at-END).
- `.gitignore` (gerado pelo `/init`) inclui `.speckit/graph.json`.

### Notas

- O plugin SpecKit não chama LLM diretamente. O grafo entra no contexto via `copilot-instructions.md` (auto-lido pelo Copilot Chat) — não há premium request.
- Workspaces greenfield (sem código nas linguagens suportadas) entram automaticamente em modo no-op.
- Extractors Python/Java/C# são marcados `partial: true` em `meta.partialLanguages`. O bloco `GRAPH CONTEXT` exibe aviso de cobertura parcial quando aplicável.

### Referências

- arXiv [2602.20048v1](https://arxiv.org/html/2602.20048v1) — "Navigation Paradox" / CodeCompass: posicionamento de checklist no final do contexto reduz contradições.
- [safishamsi/graphify](https://github.com/safishamsi/graphify) — padrão de schema, atributos `confidence` e tipos de aresta.
