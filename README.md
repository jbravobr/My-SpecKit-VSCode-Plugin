# SpecKit — Spec Driven Development

Plugin para VS Code que implementa o fluxo de **Spec Driven Development (SDD)**: você define uma História estruturada (nova feature) ou um Fix estruturado (correção de bug) antes de escrever código, e o plugin gera automaticamente os arquivos de configuração do GitHub Copilot que "primam" a sessão com todo o contexto do projeto.

O Copilot passa a conhecer o requisito de negócio, critérios de aceite, restrições não-funcionais, stack técnica, padrão arquitetural, regras de teste, convenções de versionamento, padrões de segurança, observabilidade e resiliência — antes de qualquer conversa começar.

---

## Guia de leitura

| Ordem | Seção                                | Quando ler                                        |
| ----- | ------------------------------------ | ------------------------------------------------- |
| 1     | **Como usar**                        | Fluxo essencial de ponta a ponta                  |
| 2     | **Comandos**                         | Referência objetiva de cada comando (15 comandos) |
| 3     | **Paleta de comandos**               | Atalhos via `Ctrl+Shift+P`                        |
| 4     | **Configuração do workspace**        | Defaults, detecção de stack, backup, logging      |
| 5     | **Arquivos gerados**                 | O que o plugin cria e para que serve              |
| 6     | **Gates de implementação**           | Como os agents conduzem a implementação           |
| 7     | **Modos de agente**                  | 5 modos com exemplos (debugger, refactor, etc.)   |
| 8     | **Guia prático — do zero à entrega** | Passo a passo numerado do fluxo completo          |
| 9     | **Exemplos práticos**                | Cenários completos (Story e Fix)                  |
| 10    | **Rastreabilidade e auditoria**      | Como auditar e rastrear o histórico de specs      |
| 11    | **Referência rápida**                | Tabelas "o que dizer ao agente" por cenário       |
| 12    | **FAQ**                              | Perguntas frequentes e troubleshooting            |
| 13    | **Limitações conhecidas**            | Restrições atuais e roadmap                       |

**Resumo do fluxo em 4 passos:**

```
  +------------+    +----------+    +-------------+    +----------+    +======+
  | Criar spec +--->| Validar  +--->| Implementar +--->| Revisar  +--->| Done |
  +------------+    +----------+    +-------------+    +----------+    +======+
   /draft /new /fix   /validate    agent implementador  agent revisor
```

> **Criar** e **validar** acontecem no chat `@speckit`. **Implementar** e **revisar** acontecem em sessões separadas do Copilot Chat, selecionando os agents no dropdown.

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

Para gerar um artefato local de release com o fluxo oficial do repositório:

```bash
npm run package
```

O comando gera o `.vsix` em `publish/<version>/` e falha se o artefato incluir conteúdo proibido como `coverage/`, `assets/diagrams/` ou `tests/`.

Além disso, o `npm run package` valida automaticamente o padrão obrigatório de changelog da versão:

- Técnico: `publish/<version>/CHANGELOG-<version>.txt`
  - Título `SpecKit — Changelog <version>`
  - `Data`, `Branch base`, tipo de release (`RELEASE|PATCH|HOTFIX|MINOR|MAJOR`)
  - Seções: `Resumo da release`, `Mudanças técnicas`, `Documentação`, `Testes adicionados`, `Validação executada antes do release`, `Artefato gerado`
- Usuário: `publish/<version>/CHANGELOG-USER-<version>.txt`
  - Título `SpecKit — Novidades para usuários — <version>`
  - `Data`
  - Seções: `Resumo`, `Novas features`, `Melhorias de experiência`, `Correções e segurança de release`, `Como usar rapidamente`, `Artefato`

Se qualquer seção obrigatória estiver ausente ou mal formatada, o empacotamento é bloqueado.

---

## Como usar

O SpecKit expõe um **Chat Participant** chamado `@speckit`. Todo o fluxo acontece no Copilot Chat.

> O participant é marcado como **sticky** — uma vez invocado, ele permanece selecionado até você trocar de participant. Não é necessário digitar `@speckit` em cada mensagem.

### Ponto de entrada: estruturado ou por texto livre

| Modo                | Comando                       | Quando usar                                                            |
| ------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| **Texto livre**     | `@speckit /draft <descrição>` | Ideia ainda informal, não sabe os campos obrigatórios, quer ser guiado |
| **Template direto** | `@speckit /new` ou `/fix`     | Já conhece a estrutura e quer preencher diretamente                    |

Ambos os caminhos convergem para o mesmo `.speckit/STORY-XXX.md` ou `FIX-XXX.md` e seguem o mesmo fluxo de validação e implementação.

### Fluxo — Nova Feature (História)

```
  +=================== Criar a spec ===================+
  |                                                    |
  |  /draft (texto livre)          /new (template)     |
  |       |                             |              |
  |       v                             v              |
  |  elicit-story.prompt.md     STORY-XXX.md (editor)  |
  |       |                             |              |
  |       v                             |              |
  |  Entrevista 6 fases                 |              |
  |       |                             |              |
  |       v                             |              |
  |  STORY-XXX.md ----------------------+              |
  +========================+===========================+
                           v
  +=================== Validar ========================+
  |  /validate --> Lacunas? --Sim--> gap-fill --+     |
  |                   |                         |     |
  |                  Nao                  (volta)     |
  |                   v                               |
  |          DoR atingido + 9 arquivos                |
  +========================+==========================+
                           v
  +============ Implementar + Revisar ================+
  |  agent implementador --> agent revisor            |
  |     (Gates 0-2)            (Gates 3-4)            |
  +===================================================+
```

### Fluxo — Correção de Bug (Fix)

```
  +================== Criar a spec (Fix) ==============+
  |                                                     |
  |  /draft --fix (texto livre)     /fix (template)     |
  |       |                              |              |
  |       v                              v              |
  |  elicit-fix.prompt.md       FIX-XXX.md + stack auto |
  |       |                              |              |
  |       v                              |              |
  |  Entrevista 7 fases                  |              |
  |       |                              |              |
  |       v                              |              |
  |  FIX-XXX.md -------------------------+              |
  +=========================+===========================+
                            v
  +=================== Validar ========================+
  |  /validate --> Lacunas? --Sim--> gap-fill --+     |
  |                   |                         |     |
  |                  Nao                  (volta)     |
  |                   v                               |
  |          Fix valido + 7 arquivos                  |
  +========================+==========================+
                           v
  +============= Corrigir + Revisar ==================+
  |  agent fix-implementador --> agent fix-revisor    |
  |       (Gates 0-2)              (Gates 3-4)        |
  +===================================================+
```

---

## Comandos

### Padrão de resposta unificado no chat

Os comandos do participant seguem um padrão unificado de resposta:

- bloco principal em Markdown (resultado, contexto e orientação),
- seção **Comandos disponíveis agora (contextuais)** quando aplicável,
- quick actions via botão (`stream.button`) com `speckit.openChatWithQuery`.

Isso vale também para fallback/default do participant, reduzindo respostas “sem próximo passo” e melhorando a navegação entre fluxos no chat.

### `@speckit /draft`

Converte texto livre em um prompt de elicitação que guia o Copilot a entrevistar você e montar a spec completa — Story ou Fix — sem que você precise conhecer os campos obrigatórios de antemão.

```
@speckit /draft <descrição livre>
```

**Detecção automática de intent:**

| Input                                                                     | Intent detectado                   | Arquivo gerado                             |
| ------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------ |
| `@speckit /draft Quero calcular comissão de vendedores via Kafka`         | story                              | `.speckit/elicit-story-{nextId}.prompt.md` |
| `@speckit /draft Login retorna 500 após expiração do token --fix`         | fix (flag `--fix`)                 | `.speckit/elicit-fix-{nextId}.prompt.md`   |
| `@speckit /draft O botão de exportar não funciona no Firefox`             | fix (keyword `não funciona`)       | `.speckit/elicit-fix-{nextId}.prompt.md`   |
| `@speckit /draft Crash ao abrir o modal de pagamento`                     | fix (keyword `crash`)              | `.speckit/elicit-fix-{nextId}.prompt.md`   |
| `@speckit /draft Migrar módulo de pagamento para hexagonal --refactoring` | refactoring (flag `--refactoring`) | `.speckit/elicit-story-{nextId}.prompt.md` |
| `@speckit /draft Avaliar viabilidade de SSR com Next.js --spike`          | spike (flag `--spike`)             | `.speckit/elicit-story-{nextId}.prompt.md` |

**Flags explícitas:**

| Flag            | Intent      | Aliases      |
| --------------- | ----------- | ------------ |
| `--fix`         | fix         | `--bug`      |
| `--refactoring` | refactoring | `--refactor` |
| `--spike`       | spike       | `--poc`      |

> Flags `--refactoring` e `--spike` geram um `elicit-story-{id}.prompt.md` com `type: refactoring` ou `type: spike` no metadata da spec. A entrevista é a mesma de story, mas o agente adapta o foco (refactoring → escopo cirúrgico; spike → viabilidade e aprendizado).

**Keywords que ativam intent fix (detecção automática, sem flag):** `bug`, `erro`, `error`, `falha`, `falhou`, `quebrado`, `broke`, `broken`, `crash`, `regressão`, `regression`, `corrigir`, `correção`, `não funciona`.

**Após a geração:** o SpecKit cria o arquivo de elicitação, abre no editor e instrui a iniciar um **Novo Chat em modo Agente** para conduzir a entrevista estruturada.

<details>
<summary><strong>Fases da entrevista — Story (6 fases)</strong></summary>

| Fase | Tema                    | Campos elicitados                                                                                                                  |
| ---- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Requisito de negócio    | Problema + urgência, valor de negócio + KPI candidato, stakeholders                                                                |
| 2    | Especificação funcional | User stories, critérios de aceite (quadrante: happy path · limites · rejeição · idempotência), fora de escopo derivado do contexto |
| 3    | NFRs                    | Performance (P99 com isenção para async), segurança, escalabilidade como código + recomendações de infra, disponibilidade          |
| 4    | Especificação técnica   | Linguagem, framework, arquitetura (sempre pergunta, sugere mas não presume), target, banco, infra                                  |
| 5    | Dependências, DoR e DoD | DoR com critérios AI-verificáveis separados dos de ação humana, DoD contextual (Kafka → DLQ rate, frontend → WCAG 2.1)             |
| 6    | Montagem final          | Salva `.speckit/STORY-XXX.md`, confirma criação                                                                                    |

</details>

<details>
<summary><strong>Fases da entrevista — Fix (7 fases)</strong></summary>

| Fase | Tema                   | Campos elicitados                                                                                                            |
| ---- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1    | Bug description        | Sintomas, primeira ocorrência, passos para reproduzir, ambiente, workaround, frequência, urgência — título proposto no final |
| 2    | Hipótese               | Pergunta aberta — extrai `hypothesis`, `suspectedFiles`, `suspectedComponents`                                               |
| 3    | Impacto                | Severidade cruzada com workaround, volume de usuários afetados, risco de regressão com nível e razão                         |
| 4    | Prevenção de regressão | Testes a adicionar                                                                                                           |
| 5    | Contexto técnico       | Sinaliza ativamente: Redis/TTL/cache miss, load balancer, config env, version flags                                          |
| 6    | DoF                    | Critérios de Definition of Fixed + adições contextuais                                                                       |
| 7    | Montagem final         | Salva `.speckit/FIX-XXX.md`, confirma criação                                                                                |

</details>

> **Regras do agente:** UMA pergunta por vez. Nunca inventa ou assume resposta. Resumo e confirmação ao final de cada fase. "Não sei" ≠ "N/A".

---

### `@speckit /new`

Cria o arquivo `.speckit/STORY-XXX.md` (numeração automática) e abre no editor.

| Seção                       | O que preencher                                                      |
| --------------------------- | -------------------------------------------------------------------- |
| Requisito de Negócio        | Problema, valor de negócio, stakeholders                             |
| Especificação Funcional     | User stories, critérios de aceite, fora de escopo                    |
| Especificação Não-Funcional | Performance, segurança, escalabilidade, usabilidade, disponibilidade |
| Especificação Técnica       | Linguagem, framework, arquitetura, target, banco, infra              |
| DoR                         | Marcar com `[x]` os critérios já atendidos                           |
| DoD                         | Critérios de conclusão                                               |

<details>
<summary><strong>Valores suportados</strong></summary>

| Campo       | Valores                                                               |
| ----------- | --------------------------------------------------------------------- |
| Linguagem   | `typescript` · `javascript` · `java` · `csharp` · `python`            |
| Framework   | `dotnet` · `springboot` · `angular` · `react` · `fastapi` · `other`   |
| Arquitetura | `hexagonal` · `layered` · `microservices` · `monolith` · `serverless` |
| Target      | `backend` · `frontend` · `bff` · `script` · `library`                 |

</details>

<details>
<summary><strong>Metadata da spec (campos automáticos)</strong></summary>

Cada spec contém um bloco `<!-- metadata -->` no markdown com campos gerenciados automaticamente:

| Campo          | Valores                                                              | Descrição                                                                                  |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `type`         | `story` · `refactoring` · `spike`                                    | Tipo da spec (story default, ou via `--refactoring`/`--spike` no `/draft`)                 |
| `status`       | `open` · `in-progress` · `review` · `blocked` · `done` · `cancelled` | Ciclo de vida da spec                                                                      |
| `gate`         | `0` · `1` · `2` · `3` · `4`                                          | Gate atual de implementação                                                                |
| `projectStage` | `greenfield` · `brownfield`                                          | Maturidade do projeto (afeta profundidade das instruções)                                  |
| `depends-on`   | IDs separados por vírgula (ex: `US-002, BF-001`)                     | Fonte canônica e exclusiva de dependências — story não inicia até que todas estejam `done` |

> `type`, `status` e `gate` são usados pelo `/status` para exibir o progresso. O `projectStage` influencia o nível de detalhe dos skills gerados (greenfield → mais guardrails).
> Dependências entre stories são consideradas **somente** quando declaradas no metadata `depends-on`. Menções no corpo da história, critérios de aceite, fora de escopo, infraestrutura ou contexto são ignoradas para bloqueio de dependência.

</details>

> **NFRs de performance** são opcionais — quando não preenchidos, o plugin aplica baseline (`P99 < 500ms` / `99,9%`) em todos os arquivos dependentes.

---

### `@speckit /fix`

Cria o arquivo `.speckit/FIX-XXX.md` (numeração automática) e abre no editor.

| Seção                 | O que preencher                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Bug Description       | Título, sintomas, passos para reproduzir, ambiente, frequência                             |
| Root Cause Hypothesis | Hipótese da causa raiz, arquivos/componentes suspeitos                                     |
| Impact Assessment     | Severidade (`critical` · `high` · `medium` · `low`), usuários afetados, risco de regressão |
| Regression Prevention | Testes a adicionar para prevenir regressão                                                 |
| DoF                   | Critérios de Definition of Fixed                                                           |

> **Stack técnica detectada automaticamente** a partir do workspace (`package.json`, `pom.xml`, `*.csproj`, `requirements.txt`, `pyproject.toml`). Campos extras quando detectados: `messaging` (ex: Kafka), `database` (ex: PostgreSQL).

---

### `@speckit /validate`

Detecta automaticamente o tipo da spec ativa em `.speckit/` (Story ou Fix) e valida campos obrigatórios.

**Spec com lacunas:**

1. Gera `.speckit/gap-fill.prompt.md` — um prompt estruturado que lista todas as lacunas
2. Abre o arquivo no editor automaticamente
3. Instrui a executar o prompt no Copilot Agent (via ▶ Run in Copilot Chat ou `#gap-fill.prompt.md`)
4. O agente preenche as lacunas uma a uma e atualiza o arquivo da spec
5. Após completar, volta ao `@speckit /validate` para revalidar
6. **Stories:** exibe status do DoR com checkboxes (`[x]` / `[ ]`) para cada critério

**Spec válida:**

1. Faz **backup** do `copilot-instructions.md` existente em `.speckit/backups/`
2. **Story válida:** gera 9 arquivos em `.github/` (skills + agents + prompt + workflows CI)
3. **Fix válido:** detecta stack automaticamente, gera 7 arquivos em `.github/` (sem workflows CI)
4. **Avalia DevTools do projeto** — verifica se ESLint, Prettier, husky e lint-staged estão configurados (ver abaixo)
5. Instrui a abrir modo **Agente** com o agent **implementador** (dropdown) para Gates 0–2
6. Registra log em `.speckit/logs/session-<data>.md`

**Oferta de DevTools (automática):**

Após gerar os arquivos em `.github/`, o `/validate` analisa o workspace do usuário e reporta quais ferramentas de qualidade estão presentes ou ausentes:

| Ferramenta      | O que faz                                                |
| --------------- | -------------------------------------------------------- |
| **ESLint**      | Análise estática — detecta bugs antes da execução        |
| **Prettier**    | Formatação automática — estilo consistente sem discussão |
| **husky**       | Git hooks — impede commit de código com problemas        |
| **lint-staged** | Lint apenas nos arquivos alterados — rápido no commit    |

- ✅ Ferramentas já presentes são listadas com aviso de **não sobrescrever**
- ⚠️ **Conflitos brownfield** são alertados (ex: `.eslintrc*` + `eslint.config.*` coexistentes)
- 🔧 Ferramentas ausentes são descritas com impacto no projeto existente
- O usuário opta via **botão interativo** ou flag `--devtools`

Se aceito, gera `speckit-devtools/SKILL.md` em `.github/skills/` com instruções de instalação **adaptadas à stack** (TS/JS → ESLint + typescript-eslint + Prettier; Java → Checkstyle + Spotless; Python → Ruff; C# → dotnet format + Roslyn).

> Se todas as ferramentas já estiverem configuradas, exibe apenas `✅ Tooling de qualidade já configurado`.
>
> Para incluir o skill diretamente sem botão: `@speckit /validate --devtools`

---

### `@speckit /status`

Exibe resumo de todas as specs abertas no workspace:

- **Stories:** título, linguagem/framework/arquitetura, status de validação (✅ DoR atingido / ⚠️ N lacunas), gate atual (`🚪 Gate N — Label`)
- **Fixes:** título, severidade (🐛 critical / high / medium / low), gate atual (`🚪 Gate N — Label`)
- Specs com `status: done` ou `cancelled` são ocultadas automaticamente

**Opções:**

- `@speckit /status` → mostra somente specs abertas
- `@speckit /status --all` (ou `--closed`) → inclui specs `done` e `cancelled`
- `@speckit /status-all` → atalho para `@speckit /status --all`

Se você passar um parâmetro inválido, o comando retorna o uso correto e sugere as flags suportadas.

**Exemplo de output:**

```
Stories abertas (2):
- ✅ STORY-001.md — Cálculo de comissão [in-progress]  java / springboot / hexagonal  | 🚪 Gate 1 — Implementação
- ⚠️ (3 lacunas) STORY-002.md — Dashboard vendas [open]  typescript / react / layered  | 🚪 Gate 0 — Alinhamento

Fixes abertos (1):
- 🐛 FIX-001.md — Login OAuth2 500 [high]  | 🚪 Gate 2 — Testes
```

### `@speckit /help`

Ajuda rápida para descobrir parâmetros e atalhos sem sair do chat.

**Uso:**

```
@speckit /help
@speckit /help status
@speckit /help batch
@speckit /help validate
@speckit /help draft
@speckit /help-status
```

**Atalhos úteis para descobrir parâmetros:**

- `@speckit /status-all` → `@speckit /status --all`
- `@speckit /batch-generate` → `@speckit /batch --generate`
- `@speckit /batch-unified` → `@speckit /batch --generate --unified`
- `@speckit /help-status` → `@speckit /help status`

---

### `@speckit /agent`

Alterna o modo operacional do agente. Cada modo injeta guardrails e protocolos diferentes na sessão.

**Uso:**

```
@speckit /agent                → Exibe modo ativo e modos disponíveis
@speckit /agent debugger       → Ativa modo debugger
@speckit /agent refactor       → Ativa modo refactor
@speckit /agent implementador  → Ativa modo implementador (Gates 0-2)
@speckit /agent revisor        → Ativa modo revisor (Gates 3-4)
@speckit /agent default        → Volta ao modo conversacional
```

**Modos disponíveis:**

| Modo            | Descrição                                                         |
| --------------- | ----------------------------------------------------------------- |
| `default`       | Conversacional — ajuda geral sem protocolo de gate                |
| `implementador` | Gates 0-2: spec → plan → implement → test                         |
| `revisor`       | Gates 3-4: checklist de qualidade → segurança → entrega           |
| `debugger`      | Hipótese → evidência → fix mínimo → verificação → documentação    |
| `refactor`      | Snapshot → refatorar → validar continuamente → rollback se falhar |

**Exemplo de output (sem argumento):**

```
Modo ativo: Default (conversacional)

Modos disponíveis:
- default — Default (conversacional)
- implementador — Implementador (Gates 0-2: spec → plan → implement → test)
- revisor — Revisor (Gates 3-4: checklist de qualidade → segurança → entrega)
- debugger — Debugger (hipótese → evidência → fix → verificação)
- refactor — Refactor (snapshot → refatorar → validar → rollback se falhar)

Uso: @speckit /agent debugger
```

**Exemplo de output (modo ativado):**

```
✅ Modo alterado para Debugger (hipótese → evidência → fix → verificação)

---

AGENT MODE: Debugger
Stack detectada: typescript / react

1. Captura — Capture mensagem de erro, stack trace e passos para reprodução
2. Hipótese — Formule uma hipótese sobre a causa raiz
3. Evidência — Leia código, verifique logs, isole a falha
4. Fix Mínimo — Correção cirúrgica atacando a causa raiz
5. Verificação — Teste que reproduz a falha original
6. Documentação — Causa raiz e recomendações de prevenção
```

> O modo persiste durante toda a sessão da extensão. Ao fechar e reabrir o VS Code, volta para `default`.

> Para protocolos completos de Gates, selecione os agents no dropdown do Copilot Chat (ver **Modos de agente**).

---

### `@speckit /gate`

Exibe regras de transição de gate e status, ou valida se uma transição específica é permitida.

**Uso:**

```
@speckit /gate                              → Mostra todas as regras
@speckit /gate rules                        → Mostra todas as regras
@speckit /gate check gate 0 1               → Valida transição Gate 0 → Gate 1
@speckit /gate check gate 2 0               → Valida regressão Gate 2 → Gate 0
@speckit /gate check status open in-progress → Valida transição de status
```

**Regras de transição de gate:**

| De                     | Para                   | Regra                    |
| ---------------------- | ---------------------- | ------------------------ |
| Gate 0 — Alinhamento   | Gate 1 — Implementação | ✅ Avanço +1             |
| Gate 1 — Implementação | Gate 0 ou Gate 2       | ✅ +1 ou -1 (retrabalho) |
| Gate 2 — Testes        | Gate 1 ou Gate 3       | ✅ +1 ou -1              |
| Gate 3 — Revisão       | Gate 2 ou Gate 4       | ✅ +1 ou -1              |
| Gate 4 — Entrega       | Gate 3                 | ✅ Apenas regressão -1   |

> Avanço máximo: +1. Regressão máxima: -1 (retrabalho). Saltos como Gate 0 → Gate 3 são **bloqueados**.

**Regras de transição de status:**

| De            | Próximos válidos                   |
| ------------- | ---------------------------------- |
| `open`        | `in-progress`, `cancelled`         |
| `in-progress` | `review`, `blocked`, `cancelled`   |
| `review`      | `in-progress`, `done`, `cancelled` |
| `blocked`     | `in-progress`, `cancelled`         |
| `done`        | 🔒 terminal                        |
| `cancelled`   | 🔒 terminal                        |

**Exemplo de validação:**

```
@speckit /gate check gate 1 2
```

```
✅ Gate 1 → Gate 2 — Transição permitida
Próximos gates válidos a partir de Gate 1: Gate 0, Gate 2
```

```
@speckit /gate check gate 0 3
```

```
❌ Gate 0 → Gate 3 — Transição bloqueada
Motivo: Salto de +3 não permitido (máximo: +1)
Próximos gates válidos a partir de Gate 0: Gate 1
```

---

### `@speckit /audit`

Exibe o log de auditoria do workspace — todas as ações executadas pelo plugin com timestamp.

**Uso:**

```
@speckit /audit       → Últimas 20 entradas (padrão)
@speckit /audit 50    → Últimas 50 entradas
@speckit /audit 5     → Últimas 5 entradas
```

O limite aceita valores de 1 a 100.

**Exemplo de output:**

```
📋 Audit Log — últimas 5 de 23 entradas

2026-03-19T10:15:00Z [command] /new
2026-03-19T10:15:01Z [command] /new — ok
2026-03-19T10:22:30Z [command] /validate
2026-03-19T10:22:31Z [command] /validate — ok
2026-03-19T10:30:00Z [command] /agent
```

> O log é gravado automaticamente em `.speckit/audit.log`. Cada comando registra entrada e resultado.

---

### `@speckit /trace`

Visualiza registros de rastreabilidade — histórico completo de cada spec com todas as transições de gate, status e validações.

**Uso:**

```
@speckit /trace                → Lista todas as specs rastreadas
@speckit /trace list           → Lista todas as specs rastreadas
@speckit /trace STORY-001      → Detalhes de uma spec específica
@speckit /trace FIX-001        → Detalhes de um fix específico
```

**Exemplo de output (lista):**

```
🔗 Rastreabilidade — 3 spec(s)

| Spec ID    | Tipo  | Entradas | Última atualização       |
|------------|-------|----------|--------------------------|
| STORY-001  | story | 8        | 2026-03-19T14:30:00Z     |
| STORY-002  | story | 3        | 2026-03-19T11:00:00Z     |
| FIX-001    | fix   | 5        | 2026-03-19T16:00:00Z     |

> Use @speckit /trace <spec-id> para ver detalhes.
```

**Exemplo de output (detalhe):**

```
🔗 Trace — STORY-001

| Campo      | Valor                    |
|------------|--------------------------|
| Tipo       | story                    |
| Criado     | 2026-03-19T10:00:00Z     |
| Atualizado | 2026-03-19T14:30:00Z     |
| Entradas   | 8                        |

Histórico:
- 2026-03-19T10:00:00Z — created: Spec criada via /new
- 2026-03-19T10:05:00Z — validated: DoR atingido, 9 arquivos gerados
- 2026-03-19T10:30:00Z — gate-transition: Gate 0 → Gate 1
- 2026-03-19T12:00:00Z — gate-transition: Gate 1 → Gate 2
- 2026-03-19T14:00:00Z — gate-transition: Gate 2 → Gate 3
- 2026-03-19T14:30:00Z — status-change: in-progress → review
```

---

### `@speckit /history`

Exibe histórico agregado em uma única visão, combinando eventos de auditoria, trace e session log.

Além da lista cronológica, o comando também apresenta um resumo de sessões canônicas (top por volume) para facilitar navegação de histórico.

**Uso:**

```
@speckit /history           → Agregado (audit + trace + log), últimas 20 entradas
@speckit /history audit     → Somente audit
@speckit /history trace 50  → Somente trace, últimas 50 entradas
@speckit /history log 100   → Somente session log, últimas 100 entradas
@speckit /history sessions 8                     → Somente resumo de sessões canônicas (top 8)
@speckit /history session implementador          → Drill-down por termo de alias
@speckit /history session "Comissao + revisor"  → Drill-down por alias completo/trecho (com aspas)
```

**Filtros válidos:** `all`, `audit`, `trace`, `log`

**Modos adicionais:** `sessions`, `session <alias|termo>`

**Exemplo de contexto exibido por entrada:**

```
spec:US-WORKSPACE-20260501-1030, agent:implementador, gate:2, alias:Comissao Kafka + implementador + Gate-2
```

---

### `@speckit /diff`

Mostra o git diff no chat — útil para revisar alterações sem sair da conversa.

**Uso:**

```
@speckit /diff          → Diff resumido (stat)
@speckit /diff --full   → Diff completo (todas as alterações)
@speckit /diff -f       → Alias para --full
```

**Exemplo de output (resumo):**

```
Git Diff (resumo):

 src/middleware/auth.ts | 15 +++++++++------
 src/routes/auth.ts     |  3 ++-
 2 files changed, 11 insertions(+), 7 deletions(-)
```

**Exemplo de output (completo):**

````
Git Diff (completo):

```diff
diff --git a/src/middleware/auth.ts b/src/middleware/auth.ts
--- a/src/middleware/auth.ts
+++ b/src/middleware/auth.ts
@@ -12,6 +12,10 @@ export function authMiddleware(req, res, next) {
     jwt.verify(token, secret, (err, decoded) => {
-      if (err) throw err;
+      if (err instanceof jwt.TokenExpiredError) {
+        return res.status(401).json({ error: 'token_expired' });
+      }
+      if (err) return res.status(401).json({ error: 'invalid_token' });
       req.user = decoded;
```
````

> Se não houver alterações pendentes: `✅ Nenhuma alteração pendente.`

---

### `@speckit /commit`

Faz auto-stage de todas as alterações e commit com prefixo `speckit:`.

**Uso:**

```
@speckit /commit <mensagem>
@speckit /commit
```

Sem `<mensagem>`, o comando tenta derivar um padrão automático com base na spec ativa (Story/Fix) e no gate atual.

**Exemplos:**

```
@speckit /commit feat(STORY-001): implementar cálculo de comissão
@speckit /commit fix(FIX-001): tratar TokenExpiredError no middleware
@speckit /commit refactor: extrair validação de gate
@speckit /commit test: adicionar cenários de edge case
```

**Exemplo de output:**

```
✅ Commit realizado:

[feature/001-calculo-comissao 3a1b2c3] speckit: feat(STORY-001): implementar cálculo de comissão
 4 files changed, 120 insertions(+), 15 deletions(-)
```

> O commit só executa se houver alterações pendentes. Caso contrário: `✅ Nada para commitar — working tree limpa.`

> Se o workspace ainda não for um repositório Git, o `/commit` executa `git init` automaticamente antes de verificar alterações e commitar. Os agentes implementadores gerados também recebem um preflight Git: ao encontrar `not a git repository` em `checkout`, `pull` ou `commit`, devem executar `git init` no workspace e repetir o mesmo commit uma única vez.

> No fechamento do Gate 2, os protocolos de Story passam a exigir tentativa de commit automático pelo agente e só permitem ação manual do usuário como fallback em erro operacional.

> Todos os commits são registrados no audit log automaticamente.

---

### `@speckit /review-auto`

Orquestra a revisão automática da Story ativa e as transições de gate com protocolo determinístico e saída Markdown explícita no chat.

**O que faz:**

1. Propõe transições de gate/status e exige confirmação explícita antes da persistência (`--confirm <intent-id>`)
2. Coleta evidências automáticas (arquivos alterados e cobertura `lcov` quando disponível)
3. Aplica bloqueios automáticos mínimos (ex.: cobertura ausente/abaixo de 80%, CRAP por função acima do limite)
4. Emite veredito orquestrado e força continuidade do checklist completo de revisão no mesmo fluxo
5. Expõe toda transição de gate/status com bloco Markdown `Antes` → `Depois`

**Uso:**

```
@speckit /review-auto
@speckit /review-auto --confirm <intent-id>
@speckit /review-auto --changes-requested
@speckit /review-auto --approved
@speckit /review-auto --batch-consent
@speckit /review-auto --batch-consent --confirm <intent-id>
@speckit /review-auto --auto
@speckit /review-auto --mutation
```

> Fora do modo `--auto`, toda transição proposta por `/review-auto` exige confirmação explícita com `--confirm <intent-id>`.
> No modo unificado, confirme um consentimento único de sessão com `/review-auto --batch-consent` antes de usar `/review-auto --auto`.
> Se o veredito for **ALTERAÇÕES SOLICITADAS** no unificado, execute `/review-auto --changes-requested --auto`.
> Se o veredito for **APROVADO** no unificado, execute `/review-auto --approved --auto` (Gate 4 fica em `status: ready-to-commit` até o commit final com `/commit`).
> Comandos `@speckit /...` devem ser acionados pelo participant no chat (ex.: `speckit.runChatQuickAction` via `vscode/runCommand`), não via terminal/PowerShell.

---

### `@speckit /verify`

Executa a **validação determinística automática** da Story ativa para o próximo Gate (ou um Gate específico via `--gate N`) e grava evidência consumível pelo **Revisor**.

**O que faz:**

1. Lê a spec ativa em `.speckit/` e identifica o Gate alvo (`currentGate + 1` por padrão).
2. Roda o conjunto de validadores apropriado ao Gate alvo:
   - StoryHeuristicValidator (disciplinas ausentes: idempotência, máquina de estado, recovery, BVA)
   - TypecheckValidator (`tsc --noEmit` para TS/JS; demais stacks → delegado ao Revisor)
   - AcceptanceCriteriaTestPresenceValidator (cada AC tem ≥1 teste rastreável)
   - TestExecutionValidator (`vitest related` para arquivos da story)
   - CoverageThresholdValidator (≥80% por arquivo, lendo `coverage/coverage-summary.json`)
   - CrapValidator (CRAP > 30 em função tocada pela story)
3. Persiste evidência em `.speckit/evidence/<specId>-<runId>.{md,json}` e atualiza `.speckit/evidence/latest.md` (consumido pelo Revisor no próximo turno).
4. Emite no chat o resumo determinístico (`✅ APROVADO` / `🛑 BLOQUEADO`) e o prompt formatado para o Implementador corrigir achados.

**Uso:**

```
@speckit /verify
@speckit /verify --gate 2
@speckit /verify --gate 3
```

**Quando dispara automaticamente (sem precisar do comando):**

- Ao **salvar a spec** (`.speckit/**/*.md`): heurística de disciplinas é recalculada → `.speckit/evidence/latest-heuristic.md`.
- Ao **salvar arquivo de código** TS/JS, se a story estiver em Gate ≥ 2: CRAP do arquivo é recalculado → `.speckit/evidence/latest-crap.md`.
- Ao **transitar de Gate** via `/review-auto`: o conjunto completo do Gate alvo roda e o resumo aparece no chat. Falhas no hook nunca abortam a transição (informacional).

> A camada é **stack-agnóstica**: nativa apenas para TS/JS. Para Java/Kotlin/Python/C#/Go, o achado vem com `delegatedToRevisor` contendo o comando exato a executar (`mvn test -pl ...`, `pytest --cov=...`, `dotnet test --filter`, `go test ./... -cover`).

---

### `@speckit /metrics`

Resume métricas locais persistidas em `.speckit/metrics/events.jsonl`: total de execuções, pass rate, p95 de duração, validadores mais executados, eventos por gate/spec. Não envia dados a nenhum serviço externo; é puramente local.

**Uso:**

```
@speckit /metrics
```

### `@speckit /score`

Avalia a completude estrutural da spec ativa em uma escala 0..100, com breakdown por dimensão (metadata, requisito de negócio, spec funcional/não-funcional, DoD, disciplinas de teste, rastreabilidade) e recomendações práticas para subir o score. Roda em <5ms sem usar LLM.

**Uso:**

```
@speckit /score
```

### Status Bar e Problems

A extensão agora mantém um item de **Status Bar** com a spec ativa, gate corrente e status da última validação (✓ / ✗). Clicar abre `/metrics`. Findings da última evidência também aparecem no painel **Problems** do VS Code com origem `speckit/<validator>`, navegáveis por arquivo:linha.

---

### `@speckit /context`

Gerencia arquivos de contexto adicionais que o agente deve considerar durante a implementação.

**Uso:**

```
@speckit /context                              → Listar arquivos de contexto
@speckit /context list                         → Listar arquivos de contexto
@speckit /context add src/auth/service.ts      → Adicionar arquivo
@speckit /context add src/middleware/auth.ts    → Adicionar outro arquivo
@speckit /context remove src/auth/service.ts   → Remover arquivo
@speckit /context clear                        → Limpar todos
```

**Exemplo de output (listar):**

```
📂 Contexto ativo — 3 arquivo(s)

- src/auth/service.ts
- src/middleware/auth.ts
- src/config/oauth.ts
```

**Validações automáticas:**

| Situação                    | Resultado                                                                      |
| --------------------------- | ------------------------------------------------------------------------------ |
| Arquivo existe no workspace | ✅ `Adicionado: src/auth/service.ts`                                           |
| Arquivo já no contexto      | ℹ️ `Já está no contexto: src/auth/service.ts`                                  |
| Arquivo não encontrado      | ❌ `Arquivo não encontrado: src/xxx.ts`                                        |
| Caminho fora do workspace   | ❌ `Caminho inválido — não é permitido referenciar arquivos fora do workspace` |

> Útil para apontar ao agente arquivos que não são detectados automaticamente, como configurações ou contratos.

---

### `@speckit /doctor`

Diagnóstico de saúde do workspace — verifica se os diretórios, specs e configurações estão corretos.

**Uso:**

```
@speckit /doctor
```

**Exemplo de output:**

```
🩺 Diagnóstico do Workspace

| Status | Item                                          |
|--------|-----------------------------------------------|
| ✅     | .speckit/                                     |
| ✅     | .github/                                      |
| ✅     | defaults.yml                                  |
| ✅     | Stories — 2 encontrada(s)                     |
| ✅     | Fixes — 1 encontrado(s)                       |
| ✅     | Tech Stack — typescript / react (high)        |

Resultado: 6/6 verificações OK
```

**Exemplo com problemas:**

```
🩺 Diagnóstico do Workspace

| Status | Item                                          |
|--------|-----------------------------------------------|
| ❌     | .speckit/                                     |
| ❌     | .github/                                      |
| ❌     | defaults.yml                                  |
| ❌     | Stories                                       |
| ❌     | Fixes                                         |
| ✅     | Tech Stack — java / springboot (high)         |

Resultado: 1/6 verificações OK
```

> Execute `/doctor` antes de começar a trabalhar para garantir que o workspace está preparado. Ideal como primeiro passo após clonar um repositório.

---

### `@speckit /batch`

Processa **todas** as specs em `.speckit/` em lote — validação paralela + geração de configuração Copilot.

**Uso:**

```
@speckit /batch                        → Valida todas as specs e mostra resumo
@speckit /batch --generate             → Valida + gera config Copilot para cada spec válida
@speckit /batch --generate --unified   → Gera agentes unificados (implementador + revisor por story)
@speckit /batch --generate --unified --story <id> → Gera agente unificado apenas da story informada
@speckit /batch --generate --unified --branch-strategy <session|cited> → Resolve a governança de branch quando a story cita branch
@speckit /batch --generate --unified --branch-strategy session --confirm <intent-id> → Confirma a criação da branch sugerida para a sessão
@speckit /batch-generate               → Atalho para /batch --generate
@speckit /batch-unified                → Atalho para /batch --generate --unified
```

Se você passar um parâmetro inválido, o comando retorna o uso correto e sugere a combinação recomendada.

**Resumo de validação:**

O batch executa parse + validação de **todas** as specs em paralelo e exibe uma tabela:

```
Resultado do batch — 4 spec(s) encontrada(s):

| Status             | Spec            | Tipo  | Título              | Gate              | Stack            |
|--------------------|-----------------|-------|---------------------|-------------------|------------------|
| ✅ Válida          | STORY-001.md    | story | Auth OAuth2         | 1 — Implementação | typescript/react |
| ✅ Válida          | FIX-001.md      | fix   | Login 500           | 0 — Alinhamento   | java/springboot  |
| ⚠️ 3 lacuna(s)    | STORY-002.md    | story | Dashboard vendas    | 0 — Alinhamento   | typescript/react |
| ⏭️ done           | STORY-003.md    | story | Feature concluída   | 4 — Entrega       | —                |

Totais: ✅ 2 válida(s) | ⚠️ 1 inválida(s) | ❌ 0 erro(s) | ⏭️ 1 finalizada(s)
```

**Flag `--generate` (modo clássico):**

Gera config Copilot individualmente para cada spec válida — mesmo comportamento de `/validate` mas em lote. A última spec processada define o `copilot-instructions.md` ativo.

**Flag `--generate --unified` (modo unificado):**

Gera um **agente unificado por story** — cada agente contém o protocolo completo de implementação (Gates 0-2) + revisão (Gates 3-4) com ping-pong interno. Adicionalmente:

1. **Análise de dependências** — identifica stories independentes (prontas) e bloqueadas (dependências pendentes) usando somente o metadata `depends-on`
2. **Agentes por story** — cria `.github/agents/speckit-story-{id}.agent.md` com ambos os modos
3. **Batch index** — gera `copilot-instructions.md` listando todas as stories ativas, skills e agents
4. **Transição automática de revisão com consentimento** — ao concluir Gate 2, o protocolo unificado exige consentimento único (`@speckit /review-auto --batch-consent`) e então aciona `@speckit /review-auto --auto` para persistir `gate: 3` e `status: review`
5. **Execução imediata da revisão** — após o handoff, o próprio agente deve acionar `@speckit /review-auto --auto` e executar o checklist completo do Gate 3 no mesmo fluxo (sem aguardar novo comando do usuário), emitindo veredito
6. **Handoff explícito** — a transição Gate 2 → Gate 3 deve emitir no chat o bloco de handoff (`IMPLEMENTADOR → REVISOR`) com gate/status atualizados
7. **Outcomes explícitos no chat** — após o veredito, o agente deve executar `@speckit /review-auto --changes-requested --auto` (Gate 3 → 2) ou `@speckit /review-auto --approved --auto` (Gate 3 → 4 com `status: ready-to-commit` até `/commit`)
8. **Filtro por story** — use `--story <id>` em conjunto com `--generate --unified` para gerar somente o agente da story reaberta/selecionada
9. **Governança explícita de branch citada** — se alguma story citar `develop`, `main` ou outra branch, o comando pausa a geração e pede ao usuário escolher entre:
   - `--branch-strategy session` → usar sempre a branch carregada na sessão do VS Code como fonte canônica
   - `--branch-strategy cited` → respeitar as branch(es) citada(s) na spec
10. **Criação controlada da branch da sessão** — quando o usuário escolhe `session` e o Git não tem branch ativa resolvível, o SpecKit sugere uma branch `feature/batch-<yyyymmdd>-<slug>` e exige confirmação explícita via `--confirm <intent-id>` antes de criar e fixar essa branch para o restante da sessão atual

> Referências narrativas a outras stories ou fixes dentro do corpo da história não entram na análise de dependências. Para bloquear uma story, declare explicitamente o ID no campo `depends-on` do metadata.

**Exemplo de output (modo unificado):**

```
⏳ Gerando agentes unificados + análise de dependências...

💾 Backup do copilot-instructions.md anterior salvo.

### ⚠️ Dependências pendentes

- `002` bloqueada por: `001`

### ✅ Stories independentes (prontas para execução)

- `001`

✅ Agente unificado: speckit-story-001.agent.md
✅ Agente unificado: speckit-story-002.agent.md

✅ copilot-instructions.md atualizado (modo batch).

---

Resumo (modo unificado):
- 🤖 2 agente(s) unificado(s) gerado(s)
- 🔗 1 independente(s), 1 bloqueada(s)
- 📄 copilot-instructions.md gerado em modo batch

Próximo passo: Abra o Copilot Chat e selecione o agente da story desejada no dropdown.
Importante: no modo unificado, confirme um consentimento único com `@speckit /review-auto --batch-consent` antes de handoffs automáticos.
Importante: a transição Gate 2 → Gate 3 usa `@speckit /review-auto --auto` e atualiza o metadata da story para `gate: 3` e `status: review`.
Importante: após o veredito, use `@speckit /review-auto --changes-requested --auto` (rework) ou `@speckit /review-auto --approved --auto` (Gate 4 com `status: ready-to-commit` até o commit final).
Importante: no modo unificado, a transição também tenta fechar automaticamente commit pendente do Gate 2 antes da revisão.
```

**Protocolo do agente unificado:**

Cada agente unificado contém 4 protocolos embutidos:

| Protocolo   | Quando ativa                           | O que faz                                                                                                                                                                   |
| ----------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependência | Gate 0 (pré-condição)                  | Verifica apenas o metadata canônico `depends-on`; bloqueia se pendentes                                                                                                     |
| Transição   | Gate 2 → Gate 3                        | Tenta commit automático do Gate 2, exige consentimento batch único, aciona `/review-auto --auto`, persiste metadata (`gate: 3`, `status: review`) e emite handoff explícito |
| Desfecho    | Gate 3 → Gate 2 ou Gate 4              | Comandos explícitos no unificado: `/review-auto --changes-requested --auto` (retrabalho) ou `/review-auto --approved --auto` (Gate 4 com `status: ready-to-commit`) com transição visível no chat |
| Retorno     | Revisor emite "ALTERAÇÕES SOLICITADAS" | Documenta fixes, retorna ao implementador, aplica correções, re-executa revisão                                                                                             |
| Inviolável  | Sempre ativo no modo revisor           | Revisor **nunca** implementa — apenas documenta bloqueios e devolve ao implementador                                                                                        |

> Stories independentes podem ser executadas em paralelo (abas de chat separadas). Stories bloqueadas aguardam conclusão das dependências.

---

### `@speckit /init`

Inicializa o workspace e consolida specs dispersas em `.speckit/`.

**Uso:**

```
@speckit /init
```

**O que faz:**

1. **Garante `.speckit/` existe** — cria o diretório se ausente
2. **Busca specs dispersas** — encontra recursivamente arquivos `STORY-*.md` e `US-*.md` fora de `.speckit/`
3. **Consolida** — move cada arquivo encontrado para `.speckit/`, preservando o conteúdo
4. **Detecta conflitos** — se já existe um arquivo com mesmo nome em `.speckit/`, não sobrescreve

**Diretórios ignorados:** `node_modules`, `.git`, `dist`, `out`, `.venv`, `__pycache__`, `.next`, `.nuxt`, `coverage`, `build`

**Exemplo de output (specs encontradas):**

```
✅ Workspace inicializado.

📁 `.speckit/` — criado
📄 2 arquivo(s) movido(s) para `.speckit/`:
  - docs/STORY-001.md → .speckit/STORY-001.md
  - US-AUTH-002.md → .speckit/US-AUTH-002.md
```

**Exemplo de output (com conflitos):**

```
✅ Workspace inicializado.

📁 `.speckit/` — já existia
📄 1 arquivo(s) movido(s) para `.speckit/`:
  - src/STORY-002.md → .speckit/STORY-002.md

⚠️ 1 conflito(s) — não movido(s) (já existem no destino):
  - STORY-001.md
```

**Exemplo de output (nada a fazer):**

```
✅ Workspace inicializado.

📁 `.speckit/` — já existia
📄 Nenhum arquivo de estória encontrado fora de `.speckit/`.
```

> Execute `/init` logo após clonar um repositório para garantir que todas as specs estejam centralizadas. Complementa o `/doctor`.

---

### Sem comando (help)

Se chamar `@speckit` sem comando ou com comando desconhecido, exibe a lista de comandos disponíveis.

Para ajuda detalhada por comando, use `@speckit /help`.

---

## Acesso pela paleta de comandos

Além do Copilot Chat, o plugin registra atalhos na paleta de comandos (`Ctrl+Shift+P`):

| Paleta de comandos         | Equivalente no chat  |
| -------------------------- | -------------------- |
| **SpecKit: Nova História** | `@speckit /new`      |
| **SpecKit: Novo Fix**      | `@speckit /fix`      |
| **SpecKit: Validar Spec**  | `@speckit /validate` |
| **SpecKit: Status**        | `@speckit /status`   |

Cada comando da paleta abre automaticamente o Copilot Chat com o comando correspondente.

---

## Configuração do workspace

### Defaults (`defaults.yml`)

Crie `.speckit/defaults.yml` para pré-preencher campos do template em `/new` e `/draft`:

```yaml
# .speckit/defaults.yml
language: typescript
framework: react
architecture: hexagonal
target: frontend
projectStage: greenfield
database: PostgreSQL
infrastructure: AWS
```

| Campo            | Valores aceitos                                                       |
| ---------------- | --------------------------------------------------------------------- |
| `language`       | `typescript` · `javascript` · `java` · `csharp` · `python`            |
| `framework`      | `dotnet` · `springboot` · `angular` · `react` · `fastapi` · `other`   |
| `architecture`   | `hexagonal` · `layered` · `microservices` · `monolith` · `serverless` |
| `target`         | `backend` · `frontend` · `bff` · `script` · `library`                 |
| `projectStage`   | `greenfield` · `brownfield`                                           |
| `database`       | texto livre (ex: `PostgreSQL 15`, `DynamoDB`)                         |
| `infrastructure` | texto livre (ex: `AWS`, `Kafka, Docker, EKS`)                         |

> Quando defaults existem, `/new` exibe `💡 Defaults aplicados de .speckit/defaults.yml` e o template já vem preenchido.

### Detecção automática de stack (Fix)

Para fixes, a stack é detectada automaticamente do workspace sem precisar de `defaults.yml`:

| Arquivo detectado  | Language | Framework           | Lógica adicional                                                                      |
| ------------------ | -------- | ------------------- | ------------------------------------------------------------------------------------- |
| `package.json`     | TS ou JS | react/angular/other | TS se `tsconfig.json` existir. React se `react` nas deps. Angular se `@angular/core`. |
| `pom.xml`          | java     | springboot          | Sempre Spring Boot se pom presente                                                    |
| `*.csproj`         | csharp   | dotnet              | Glob match em qualquer `.csproj`                                                      |
| `requirements.txt` | python   | fastapi/other       | FastAPI se `fastapi` nos requirements                                                 |
| `pyproject.toml`   | python   | fastapi/other       | FastAPI se `fastapi` no conteúdo                                                      |

**Detecção adicional:** `target` (backend/frontend/bff/library), `architecture` (hexagonal/layered via estrutura de pastas), `messaging` (kafka se `kafkajs`/`spring-kafka` nas deps), `projectStage` (greenfield se < 10 arquivos fonte).

---

## Backup e logging

### Backup automático

Antes de cada regeneração (`/validate` com spec válida), o plugin faz backup do `copilot-instructions.md` existente:

```
.speckit/backups/
+-- 2026-03-19T10-30-00-000Z/
|   +-- copilot-instructions.md
+-- 2026-03-19T14-15-00-000Z/
|   +-- copilot-instructions.md
+-- ...
```

- Máximo de **5 backups** — os mais antigos são podados automaticamente
- Backup só ocorre se o arquivo existir e tiver conteúdo
- Mensagem `💾 Backup do copilot-instructions.md anterior salvo` exibida no chat

### Session logging

Cada execução de `/validate` e `/draft` é registrada em log Markdown diário:

```
.speckit/logs/
+-- session-2026-03-19.md
```

Formato de cada entrada:

```markdown
## 2026-03-19 10:30 — @speckit /validate

**Spec:** 001 — Cálculo de comissão
**Resultado:** ✅ Válida — 9 arquivo(s) gerado(s)
SessionAlias: Calculo de comissao + implementador + Gate-2
AgentMode: implementador
Gate: 2
CommandExecutionId: exec-...
SessionId: session-...
BatchId: batch-...
LLMResponseReceived: false

- .github/copilot-instructions.md
- .github/skills/speckit-baseline/SKILL.md
- ...
```

> Falhas de logging nunca interrompem o comando — o log é best-effort.

---

## Arquivos gerados

O conjunto exato varia conforme a stack declarada. Abaixo a estrutura completa com todos os triggers ativos.

<details>
<summary><strong>Árvore — Stories (9 arquivos + 1 opcional)</strong></summary>

```
.github/
+-- copilot-instructions.md            ← Índice always-on (~400 tokens)
+-- workflows/
|   +-- quality-gate.yml               ← Lint + Build + Testes ≥80%
|   +-- security-scan.yml              ← TruffleHog + Semgrep
+-- prompts/
|   +-- run.prompt.md                  ← Sessão única (Gates 0–4)
+-- skills/
|   +-- speckit-baseline/SKILL.md      ← 10 seções NFR (keyword-activated)
|   +-- speckit-stack/SKILL.md         ← Linguagem + framework + infra + patterns
|   +-- speckit-context-STORY-{id}/SKILL.md ← Contexto específico da story
|   +-- speckit-devtools/SKILL.md      ← (opcional) DevTools: ESLint, Prettier, husky, lint-staged
+-- agents/
    +-- speckit-implementador.agent.md ← Gates 0–2 (dropdown Copilot)
    +-- speckit-revisor.agent.md       ← Gates 3–4 (dropdown Copilot)
    +-- speckit-story-{id}.agent.md    ← (batch) Gates 0–4 unificados
```

> A sessão de implementação usa o **agent implementador** (dropdown) para Gates 0–2. A revisão usa o **agent revisor** em nova sessão. O `run.prompt.md` é uma alternativa monolítica (todos os gates em uma sessão).
> Em modo **batch unificado** (`/batch --generate --unified`), cada story recebe um agente `speckit-story-{id}` que conduz o ciclo completo com transição interna entre modos, consentimento único de sessão e atualização de metadata ao final do Gate 2 via `/review-auto --auto`.
> O skill DevTools é gerado apenas quando o usuário aceita a oferta via botão ou `--devtools`.

</details>

<details>
<summary><strong>Árvore — Fixes (7 arquivos + 1 opcional — sem workflows CI)</strong></summary>

```
.github/
+-- copilot-instructions.md            ← Índice always-on (~400 tokens)
+-- prompts/
|   +-- fix-run.prompt.md              ← Sessão única (Gates 0–4)
+-- skills/
|   +-- speckit-baseline/SKILL.md      ← 10 seções NFR (keyword-activated)
|   +-- speckit-stack/SKILL.md         ← Stack auto-detectada do workspace
|   +-- speckit-context-FIX-{id}/SKILL.md ← Contexto específico do fix
|   +-- speckit-devtools/SKILL.md      ← (opcional) DevTools: ESLint, Prettier, husky, lint-staged
+-- agents/
    +-- speckit-fix-implementador.agent.md ← Gates 0–2 (dropdown Copilot)
    +-- speckit-fix-revisor.agent.md       ← Gates 3–4 (dropdown Copilot)
```

> Fixes **não geram workflows CI** — a premissa é que os workflows do projeto já existem. A stack técnica é **detectada automaticamente** do workspace.
> O skill DevTools é gerado apenas quando o usuário aceita a oferta via botão ou `--devtools`.

</details>

<details>
<summary><strong>O que cada arquivo instrui o Copilot a fazer</strong></summary>

#### Baseline (seções dentro de `speckit-baseline/SKILL.md`)

| Seção                    | Instrui o agente a...                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00-agent-integrity`     | Nunca assumir nomes sem vê-los; declarar incerteza; respeitar escopo; exigir 80% cobertura                                                                                  |
| `01-performance`         | Big-O antes de propor; `Promise.all`/`Task.WhenAll` para I/O paralelo; paginação + caching. **SLOs da story** (ou baseline `P99 < 500ms` / `99,9%`)                         |
| `02-architecture`        | Respeitar arquitetura definida; SOLID; **timeout + retry + circuit breaker** em todo cliente HTTP; propagar `traceparent`                                                   |
| `03-context-management`  | Não misturar módulos; pedir arquivos antes de propor; declarar contexto insuficiente                                                                                        |
| `04-testing-standards`   | Happy path + edge + error; AAA obrigatório; **cenários dos critérios de aceite**; testes de carga com SLO declarado ou baseline; preflight Testcontainers com Docker/Podman |
| `05-git-workflow`        | Conventional Commits; branch `feature/<id>-<slug>`; preflight `git init` quando workspace ainda não é repo; nunca commit direto em main                                     |
| `06-credential-security` | IAM roles; secrets via SecretsManager/Vault; nunca logar tokens/senhas                                                                                                      |
| `07-observability`       | JSON com `traceId`; `traceparent` W3C; Prometheus; **SLOs parametrizados**; consumer lag em Kafka/SQS                                                                       |
| `08-security-tests`      | Sem token → 401; expirado → 401; role insuficiente → 403; SQL injection → 400; sem stack trace no response                                                                  |

> Quando testes de integração usam Testcontainers e Docker não está disponível, o agente deve verificar Podman, executar `podman machine start` se a máquina estiver parada e só então repetir a execução dos testes.
> Quando uma sessão com agente implementador executa Git diretamente, o agente deve validar `git rev-parse --is-inside-work-tree` antes de `checkout`/`commit`; se receber `not a git repository`, deve executar `git init`, confirmar com `git status` e repetir o mesmo `git add`/`git commit` apenas uma vez.

#### Infraestrutura (seções em `speckit-stack/SKILL.md`, se detectadas)

| Arquivo       | Instrui o agente a...                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `infra-kafka` | `acks=all`; idempotence no producer; dedup no consumer; DLQ com headers; backoff + jitter; graceful shutdown |
| `infra-aws`   | DynamoDB: access patterns first, single-table, optimistic locking. RDS: pool (HikariCP/EF Core), Flyway      |
| `infra-glue`  | GlueJob Python; logging estruturado; falhas parciais em ETL                                                  |

#### Padrões (seções em `speckit-stack/SKILL.md`, se aplicáveis)

| Arquivo                    | Instrui o agente a...                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `pattern-crud`             | Repository → Service → Controller; paginação; RFC 7807 ProblemDetail; validação no controller |
| `pattern-idempotency`      | `Idempotency-Key` para POST; dedup por chave de negócio; TTL; 201/200/409                     |
| `pattern-bff`              | Orquestração sem domínio; fan-out paralelo; circuit breaker; partial response; RFC 7807       |
| `pattern-contract-testing` | WireMock stubs; Pact consumer-driven; testar: happy, 404, 500, timeout                        |

#### Workflows CI

| Arquivo             | O que faz                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `quality-gate.yml`  | PR → lint → build → testes ≥80%. Comando parametrizado por linguagem. Upload de cobertura como artefato |
| `security-scan.yml` | PRs + semanal: TruffleHog (secrets) + Semgrep (SAST → SARIF → GitHub Security)                          |

</details>

---

## Gates de implementação

O SpecKit estrutura a implementação em **5 gates** distribuídos em duas sessões:

```
  +== Sessao A: agent implementador ===================+     +== Sessao B: agent revisor ==+
  |                                                     |     |                              |
  |  Gate 0 --> Gate 1 --> Gate 2 --- Novo Chat ---------->  Gate 3 --> Gate 4            |
  |  Alinhamento  Implementacao  Testes                 |     |  Revisao       Entrega       |
  |                                                     |     |                              |
  +=====================================================+     +==============================+
```

| Gate | Nome          | O que acontece                                                                                                                                        |
| ---- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Alinhamento   | Lê a spec, verifica gaps, apresenta plano e aguarda confirmação antes de escrever código                                                              |
| 1    | Implementação | Cria branch, implementa feature/fix seguindo stack e arquitetura. Sem refatorações fora de escopo. Commits incrementais                               |
| 2    | Testes        | Cenários dos critérios de aceite + edge cases + error cases. Cobertura ≥80%. Fix: regressão deve **falhar sem o fix** e passar com ele                |
| 3    | Revisão       | Nova sessão sem memória. Verifica funcionalidade, arquitetura, qualidade, testes, segurança, observabilidade, git, DoD/DoF + checklist NFRs expandido |
| 4    | Entrega       | Rebase na main, re-executa testes, valida DoD/DoF item por item, commit de encerramento                                                               |

> **Sessão única:** use `run.prompt.md` (Stories) ou `fix-run.prompt.md` (Fixes) via ▶ Run in Copilot Chat para todos os gates em uma sessão. Indicado para features pequenas.

---

## Estratégia de prompt layering e tokens

O SpecKit distribui o contexto em **3 camadas on-demand** para minimizar o consumo de tokens por interação. Em vez de carregar tudo de uma vez, cada camada é ativada por keyword matching ou seleção explícita.

| Camada                        | Conteúdo                                                                                                        | Tokens          | Carregamento                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------- |
| **Tier 1 — Always-on**        | `copilot-instructions.md` — índice mínimo com metadata da story, regras globais e referências aos skills/agents | ~400            | Automático, toda interação   |
| **Tier 2 — Skills on-demand** | 3–4 pastas de skills ativadas por keyword                                                                       | ~1500–2500 cada | Automático via keyword match |
| **Tier 3 — Agents**           | Agents com protocolo completo de gates, selecionados via dropdown                                               | ~2000–2500      | Manual, dropdown do Copilot  |

### Skills — ativação por keyword

| Skill        | Pasta                                  | Ativação                                                                       | Conteúdo                                                                                                                                                                             |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Baseline** | `.github/skills/speckit-baseline/`     | Keywords: agent, integrity, performance, testing, git, security, observability | 10 seções NFR: integridade do agente, performance, arquitetura, context management, testing standards, git workflow, credential security, observability, security tests, idempotency |
| **Stack**    | `.github/skills/speckit-stack/`        | Keywords: nome da linguagem ou framework                                       | Regras por linguagem + framework + infra + patterns. Composição condicional — inclui apenas seções relevantes à stack declarada                                                      |
| **Context**  | `.github/skills/speckit-context-{ID}/` | Keywords: ID da story ou fix                                                   | Spec completa: requisito de negócio, critérios de aceite, NFRs, stack técnica, DoR/DoD                                                                                               |
| **DevTools** | `.github/skills/speckit-devtools/`     | Keywords: devtools, lint, eslint, prettier, format, husky, pre-commit          | Instruções de instalação de ESLint, Prettier, husky e lint-staged adaptadas à stack. Gerado sob demanda via botão ou `--devtools`                                                    |

### Conteúdo do skill Stack — regras por linguagem, framework e lógica

O skill `speckit-stack` é composto dinamicamente. Cada seção abaixo só é incluída se a stack declarada na spec a referenciar.

<details>
<summary><strong>Linguagens — ~10 regras por linguagem</strong></summary>

| Linguagem              | Regras-chave                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript**         | `strict: true` obrigatório; branded types para domain IDs; discriminated unions (não enums); Zod para runtime validation; `unknown` (nunca `any`); async/await only; `noUncheckedIndexedAccess` |
| **Java 17+**           | Records para DTOs; sealed classes para ADTs; pattern matching em switch; Optional apenas como retorno; constructor injection; Java 21: virtual threads + StructuredTaskScope                    |
| **C# .NET 8+**         | `Nullable enable`; records para DTOs; pattern matching; async obrigatório (sem `.Result`/`.Wait()`); `required` keyword; `TimeProvider` injetado (não `DateTime.Now`); primary constructors     |
| **Python 3.11+**       | Type hints em tudo; Pydantic v2 para dados externos; `dataclasses(slots=True)` interno; asyncio + TaskGroup; match/case; structlog + request_id; ruff + mypy                                    |
| **JavaScript ES2022+** | ESM only; `const` default; optional chaining + nullish coalescing; async/await + `Promise.all`; array methods sobre loops; feature-based organization; `Object.freeze`                          |

</details>

<details>
<summary><strong>Frameworks — ~10 regras por framework</strong></summary>

| Framework        | Regras-chave                                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **React**        | Functional components only; smart/dumb separation; `useReducer` para estado complexo; `useEffect` só para sync externo; React 19: Actions + `useFormStatus` + `useOptimistic`; React Compiler; Zod + react-hook-form                          |
| **Angular**      | `OnPush` obrigatório; Signals para estado; `async` pipe (não `subscribe()`); Angular 17+: `input()`/`output()` functions; Angular 19: Zoneless + `linkedSignal()` + `resource()`; `trackBy` em todos os `*ngFor`; interceptors HTTP           |
| **Spring Boot**  | Constructor injection + `@RequiredArgsConstructor`; Controller/Service/Repository; `@Transactional` no service; `ProblemDetail` RFC 7807; `@RetryableTopic` + DLT; Spring Boot 3.3+: virtual threads; `@HttpExchange` client; MDC com traceId |
| **ASP.NET Core** | Clean Architecture; async `Task<T>` em todo I/O; `IOptions<T>` para config; `ILogger<T>` estruturado; middleware global de erros; query projection (nunca `SELECT *`); `ValidateOnStart()`                                                    |
| **FastAPI**      | `APIRouter` por domínio; `/api/v1/<resource>`; routers/services/repositories; Pydantic v2 schemas separados por intent; async endpoints; `Depends()` para DI; exception handlers globais                                                      |

</details>

<details>
<summary><strong>Padrões arquiteturais — composição condicional</strong></summary>

| Padrão               | Regras-chave                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CRUD**             | Repository pattern; DTOs separados (Create/Update/Response); paginação obrigatória (max 100); Specification para filtros; RFC 7807 ProblemDetail; Idempotency-Key no POST; audit fields UTC; soft delete documentado |
| **BFF**              | Orquestração sem domínio; fan-out paralelo obrigatório; token relay (validar + forward); timeout 3s por downstream; circuit breaker; partial response > falha total; stateless; RFC 7807                             |
| **Contract Testing** | WireMock stubs por downstream; cenários: happy, 404, 500, timeout; Pact consumer-driven; Gate 2 só passa com todos os contract tests verdes                                                                          |
| **Idempotência**     | PUT natural; POST com `Idempotency-Key` UUID v4; store com TTL >= 24h; dedup por business key; `ON CONFLICT DO NOTHING`; respostas: 201/200/409; Kafka: dedup por messageKey+offset                                  |

</details>

<details>
<summary><strong>Infraestrutura — composição condicional</strong></summary>

| Infra        | Regras-chave                                                                                                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kafka**    | Consumer group por serviço; at-least-once + idempotência; dedup antes de processar; `acks=all` + producer idempotente; DLQ com headers; backoff exponencial + jitter; graceful shutdown; topic naming: `<domain>.<entity>.<event>.v<N>` |
| **AWS**      | DynamoDB: access patterns first, single-table, `ConditionExpression` optimistic locking; RDS: HikariCP min=2/max=10, Flyway, prepared statements only; IAM roles (nunca access keys manuais); `DefaultCredentialsProvider`              |
| **Glue Job** | `getResolvedOptions` para params; `job.commit()` obrigatório; DynamicFrame para schema variável; pushdown predicates; erros para S3; Parquet snappy; Glue Catalog > raw S3; nunca `collect()` em datasets grandes                       |

</details>

<details>
<summary><strong>Padrões de arquitetura (por story)</strong></summary>

| Arquitetura       | Regras geradas na skill de contexto                                                     |
| ----------------- | --------------------------------------------------------------------------------------- |
| **Hexagonal**     | Domain puro, Application, Ports Input/Output, Adapters; direção nunca invertida         |
| **Layered**       | Presentation, Application, Domain, Infrastructure; controller nunca acessa repository   |
| **Microservices** | SRP por serviço; timeout 3s; circuit breaker; fan-out paralelo; schema isolation; Sagas |
| **Monolith**      | Modular com interfaces explícitas; sem dependências circulares                          |
| **Serverless**    | Stateless; cold start mínimo; optimistic locking; idempotência; IAM least-privilege     |

</details>

### Agents — protocolo de gates

| Agent                 | Arquivo                                             | Gates                                        | Seleção                  |
| --------------------- | --------------------------------------------------- | -------------------------------------------- | ------------------------ |
| **Implementador**     | `.github/agents/speckit-implementador.agent.md`     | 0–2 (alinhamento, implementação, testes)     | Dropdown no Copilot Chat |
| **Revisor**           | `.github/agents/speckit-revisor.agent.md`           | 3–4 (revisão independente, entrega)          | Dropdown no Copilot Chat |
| **Unificado (batch)** | `.github/agents/speckit-story-{id}.agent.md`        | 0–4 (ciclo completo com ping-pong interno)   | Dropdown no Copilot Chat |
| **Fix Implementador** | `.github/agents/speckit-fix-implementador.agent.md` | 0–2 (investigação, fix cirúrgico, regressão) | Dropdown no Copilot Chat |
| **Fix Revisor**       | `.github/agents/speckit-fix-revisor.agent.md`       | 3–4 (verificação, encerramento)              | Dropdown no Copilot Chat |

### Economia de tokens

Sem layering, cada interação carregaria spec + regras + gates + exemplos (~10.000+ tokens de contexto). Com a estratégia de 3 camadas:

| Cenário                        | Sem layering | Com layering                                         | Economia |
| ------------------------------ | ------------ | ---------------------------------------------------- | -------- |
| Pergunta geral sobre o projeto | ~10.000      | ~400 (tier 1)                                        | ~96%     |
| Implementando feature          | ~10.000      | ~5.000 (tier 1 + baseline + stack + context)         | ~50%     |
| Sessão de review               | ~10.000      | ~5.500 (tier 1 + baseline + context + agent revisor) | ~45%     |

---

## Modos de agente

O SpecKit oferece **5 modos de operação** que alteram o comportamento, os guardrails e os protocolos do agente. Use `/agent <modo>` para alternar.

```
  +---------+   +---------------+   +---------+   +----------+   +----------+
  | default |-->| implementador |-->| revisor |-->| debugger |-->| refactor |
  +---------+   +---------------+   +---------+   +----------+   +----------+
       ^                                                               |
       +---------------------------------------------------------------+
                            @speckit /agent <modo>
```

### Mode: Default

Modo conversacional sem protocolo de gate. Útil para perguntas gerais, testes de conceito e exploração livre.

**Quando usar:**

- Perguntas gerais sobre o projeto
- Testes rápidos de conceito
- Exploração de código sem story/fix ativa

**Exemplo de interação:**

```
Você:    @speckit /agent default
SpecKit: ✅ Modo alterado para Default (conversacional)

Você:    Como devo organizar os testes de integração neste projeto?
Agente:  Com base na stack detectada (TypeScript / React), recomendo...
```

### Mode: Implementador (Gates 0-2)

Protocolo completo de implementação: leitura de spec → plano → implementação → testes. Para features e fixes.

**Quando usar:**

- Ao iniciar a implementação de uma Story (Gates 0-2)
- Ao iniciar a implementação de um Fix (Gates 0-2)

**Protocolo injetado:**

1. NUNCA comece a codificar sem ler a spec ativa primeiro
2. Se surgir ambiguidade → pare e pergunte
3. Se o escopo mudar → replaneje antes de continuar
4. Exija aprovação explícita do usuário antes de escrever código

**Exemplo de interação:**

```
Você:    @speckit /agent implementador
SpecKit: ✅ Modo alterado para Implementador (Gates 0-2)

Você:    Implementar STORY-001 — cálculo de comissão Kafka
Agente:  Lendo spec .speckit/STORY-001.md...

         📋 Plano de implementação:
         TASK-1: Criar consumer Kafka para movimentacoes.v1
         TASK-2: Implementar engine de regras (4 tipos)
         TASK-3: Persistir comissão em PostgreSQL
         TASK-4: Emitir evento comissoes.calculadas.v1
         TASK-5: DLQ para eventos inválidos

         Confirma o plano? (sim/não)
Você:    sim
Agente:  Iniciando TASK-1...
```

> Para protocolo completo, selecione o agent **speckit-implementador** (Story) ou **speckit-fix-implementador** (Fix) no dropdown do Copilot Chat.

### Mode: Revisor (Gates 3-4)

Revisão independente com checklist de 11 dimensões. Nova sessão obrigatória — sem memória da implementação.

**Quando usar:**

- Após completar Gates 0-2 (testes passando)
- Obrigatoriamente em **nova sessão** do Copilot Chat

**Protocolo injetado:**

1. Leia a spec completa ANTES de iniciar qualquer avaliação
2. Ao encontrar decisão questionável: pergunte a razão antes de marcar como bloqueante
3. Todos os 11 itens do checklist devem ser verificados — não pule nenhum

**Exemplo de interação:**

```
Você:    @speckit /agent revisor
SpecKit: ✅ Modo alterado para Revisor (Gates 3-4)

Você:    Revisar STORY-001
Agente:  Lendo spec .speckit/STORY-001.md...

         📋 Checklist de Revisão — STORY-001
         1. ✅ Funcionalidade — 6/6 critérios de aceite verificados
         2. ✅ Arquitetura — Hexagonal, direção respeitada
         3. ✅ Qualidade de código — Sem dead code
         4. ✅ Testes — 22 testes, cobertura 87%
         5. ⚠️ Segurança — Logger inclui vendedorId nos logs (é PII?)
         6. ✅ Observabilidade — Health check presente
         ...

         VEREDITO: ALTERAÇÕES SOLICITADAS
         Blockers: 1 (segurança — PII em logs)
         Suggestions: 0
```

> Para protocolo completo, selecione o agent **speckit-revisor** (Story) ou **speckit-fix-revisor** (Fix) no dropdown do Copilot Chat.

### Mode: Debugger

Protocolo de investigação: captura → hipótese → evidência → fix mínimo → verificação → documentação. Stack-aware.

**Quando usar:**

- Bugs que precisam de investigação além de um fix simples
- Problemas sem causa raiz clara
- Issues de runtime/performance

**Protocolo injetado (adaptado à stack detectada):**

```
1. Captura    — Mensagem de erro, stack trace e passos para reprodução
2. Hipótese   — Formular hipótese sobre a causa raiz
3. Evidência  — Ler código, verificar logs, isolar a falha
4. Fix Mínimo — Correção cirúrgica atacando a causa raiz
5. Verificação — Teste que reproduz falha + validação:
   → TypeScript: npx vitest run --coverage --coverage.thresholds.lines=80
   → Java:       ./mvnw verify -Djacoco.haltOnFailure=true
   → C#:         dotnet test --collect:"XPlat Code Coverage"
   → Python:     pytest --cov=src --cov-fail-under=80
6. Documentação — Causa raiz e recomendações de prevenção
```

**Exemplo de interação:**

```
Você:    @speckit /agent debugger
SpecKit: ✅ Modo alterado para Debugger
         Stack detectada: typescript / react

Você:    O dashboard trava quando o array de vendas é vazio
Agente:  📋 Etapa 1 — Captura
         Erro: TypeError: Cannot read properties of undefined (reading 'map')
         Local: src/components/SalesDashboard.tsx:47

         📋 Etapa 2 — Hipótese
         O hook useQuery retorna undefined antes do fetch resolver.
         O componente não trata o estado de loading.

         📋 Etapa 3 — Evidência
         Confirmado: SalesDashboard.tsx:47 → sales.map() sem guard
         sales é undefined durante o loading, não array vazio.

         📋 Etapa 4 — Fix Mínimo
         + const items = sales ?? [];
         + return items.length === 0 ? <EmptyState /> : items.map(...)

         📋 Etapa 5 — Verificação
         npx vitest run --coverage → 14 passed, 0 failed

         📋 Etapa 6 — Documentação
         Causa raiz: useQuery retorna undefined antes da resolução.
         Prevenção: Sempre inicializar com fallback em hooks de data fetching.
```

> **Regra cardinal:** NÃO corrija sintomas. NÃO adivinhe — verifique com evidência.

### Mode: Refactor

Protocolo de refatoração segura: snapshot → refatorar → validar continuamente → rollback se falhar.

**Quando usar:**

- Refatorações estruturais que não alteram comportamento externo
- Extração de módulos, consolidação de duplicação
- Migração de padrões (class → function, callback → async/await)

**Protocolo injetado (adaptado à stack detectada):**

```
1. Snapshot     — Documentar comportamento atual e cobertura de testes
2. Verificação  — Garantir que todos os testes passam ANTES de qualquer mudança
3. Refatoração  — Mudanças estruturais SEM alterar comportamento externo
4. Validação    — Após CADA mudança, executar todos os testes existentes
5. Rollback     — Se algum teste falhar, reverter imediatamente
```

**Exemplo de interação:**

```
Você:    @speckit /agent refactor
SpecKit: ✅ Modo alterado para Refactor
         Stack detectada: java / springboot

Você:    Extrair as regras de comissão para um engine separado
Agente:  📋 Etapa 1 — Snapshot
         Comportamento atual: ComissaoService.calcular() com 4 if/else
         Cobertura: 87% (22 testes)

         📋 Etapa 2 — Verificação Prévia
         ./mvnw verify → BUILD SUCCESS (22 tests passed)

         📋 Etapa 3 — Refatoração
         - Criar interface RegraComissao com método calcular()
         - Implementar TaxaFixaRegra, EscalonadaRegra, ComTetoRegra, BonusCategoriaRegra
         - Criar RegraComissaoEngine com Strategy pattern
         - Refatorar ComissaoService para usar engine

         📋 Etapa 4 — Validação
         ./mvnw verify → BUILD SUCCESS (22 tests passed) ✅
         Comportamento externo inalterado.
```

> **Regra cardinal:** NÃO adicione features durante a refatoração. NÃO altere contratos externos.

---

## Garantias de qualidade por gate

Cada gate impõe verificações específicas. Nenhum gate pode ser pulado.

### Gate 0 — Alinhamento e confirmação

- Leitura obrigatória de `.speckit/STORY-{id}.md` ou `FIX-{id}.md`
- Verificação de campos preenchidos (título, valor, stack, critérios de aceite, DoD/DoF)
- **Story**: apresenta plano completo (arquivos, cenários de teste, riscos, mitigações, checklist DoD)
- **Fix**: inspeciona arquivos suspeitos via `git log --follow -p` e `git blame`, confirma ou revisa hipótese de causa raiz
- **Gate bloqueante**: agente aguarda confirmação explícita antes de prosseguir

### Gate 1 — Implementação disciplinada

- **Story**: 1 task atômico por critério de aceite ou camada de arquitetura. Conventional Commit por task: `feat({storyId}): TASK-N — descrição`
- **Fix**: correção cirúrgica apenas. Zero refatoração. Commit único: `fix({fixId}): descrição`
- Aderência à arquitetura declarada (sem imports cross-layer, direção de dependência respeitada)
- Pré-requisito: código compila, testes existentes não quebram

### Gate 2 — Testes e cobertura

- **0 falhas de teste** (condição inviolável)
- **Cobertura >= 80%** (exigida com evidência)
- Happy path: cada critério de aceite gera no mínimo 1 teste
- Edge cases: null, vazio, limites
- Error cases: not found, invalid, permission, timeout
- Estrutura AAA obrigatória (Arrange, Act, Assert)
- **Fix**: teste de regressão obrigatório — deve **falhar sem o fix** e passar com ele

### Gate 3 — Revisão independente (nova sessão)

Checklist de 11 dimensões verificadas pelo agent revisor:

| #   | Dimensão            | Verificação                                                                                                    |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Funcionalidade      | Todos os critérios de aceite funcionando                                                                       |
| 2   | Arquitetura         | Direção de dependência, isolamento de camadas                                                                  |
| 3   | Qualidade de código | Convenções, sem dead code, sem comentários injustificados                                                      |
| 4   | Testes              | 0 falhas, cobertura >= 80%, cenários happy/edge/error                                                          |
| 5   | Segurança           | Rotas protegidas retornam 401/403. Input inválido retorna 400 (não 500). Sem tokens/senhas em DTOs ou logs     |
| 6   | Observabilidade     | Health check presente e sem auth. Logs JSON com traceId/requestId. traceId propagado em erros. Sem PII em logs |
| 7   | NFRs                | Performance (P99), segurança, escalabilidade, idempotência                                                     |
| 8   | Git                 | Branch naming, Conventional Commits                                                                            |
| 9   | DoD/DoF             | Todos os itens verificados                                                                                     |
| 10  | Veredito            | APROVADO ou ALTERAÇÕES SOLICITADAS (com blockers vs suggestions)                                               |
| 11  | Revalidação         | Se alterações, commits atômicos de fix e re-execução completa do checklist                                     |

### Gate 4 — Entrega

- Rebase na main (sem fast-forward)
- Re-execução de todos os testes com report de cobertura
- Verificação item por item de DoD (Story) ou DoF (Fix)
- Commit de encerramento

---

## Guia prático — do zero à entrega

Passo a passo completo: da instalação até o commit de entrega. Aplicável a qualquer Story.

### Visão geral do fluxo

```
  +== Sessao 1: SpecKit Chat ===+   +== Sessao 2: Implementador ====+   +== Sessao 3: Revisor ==+
  |                              |   |                               |   |                        |
  |  1. Instalar plugin          |   |  4. Gate 0 -- Alinhar         |   |  7. Gate 3 -- Revisar  |
  |  2. Criar spec               |-->|  5. Gate 1 -- Implementar     |-->|  8. Gate 4 -- Entregar |
  |  3. Validar spec             |   |  6. Gate 2 -- Testar          |   |                        |
  |                              |   |                               |   |                        |
  +==============================+   +===============================+   +========================+
```

### Passo 1 — Instalar o plugin

```
Ctrl+Shift+P → Extensions: Install from VSIX → selecionar arquivo .vsix
```

### Passo 2 — Criar a spec

Abra o Copilot Chat e escolha um dos caminhos:

| Cenário                    | Comando                                                  | Para quem                                 |
| -------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| Já tenho a ideia clara     | `@speckit /draft Calcular comissão via Kafka`            | Quem prefere texto livre + entrevista     |
| Quero template e preencher | `@speckit /new`                                          | Quem prefere preencher campos manualmente |
| Bug para corrigir          | `@speckit /fix` ou `@speckit /draft "Login retorna 500"` | Ambos caminhos                            |

**Via /draft — o agente entrevista você:**

```
Você:    @speckit /draft Quero calcular comissão de vendedores a partir de eventos Kafka
SpecKit: ✅ Criado elicit-story-001.prompt.md — abra em novo chat no modo agente

[Novo Chat → Modo Agente]
Agente:  📋 Fase 1 — Requisito de Negócio
         Qual é a dor que esta feature resolve?
Você:    Cálculo de comissão é batch noturno, visibilidade apenas em D+1
Agente:  ✓ Registrado. Qual o valor que vai gerar?
Você:    Cálculo em tempo real, dashboards ao vivo, fechamento financeiro faster
Agente:  ✓ Fase 1 completa.

         📋 Fase 2 — Especificação Funcional...
         [continua por 6 fases]

Agente:  ✅ STORY-001.md criado em .speckit/
         Execute @speckit /validate para gerar os arquivos do Copilot.
```

**Via /new — preencha o template:**

```
Você:    @speckit /new
SpecKit: ✅ Criado .speckit/STORY-002.md — preencha e execute /validate
```

### Passo 3 — Validar a spec

```
Você:    @speckit /validate
```

**Se a spec estiver completa:**

```
SpecKit: ✅ DoR atingido — Story completa
         📁 9 arquivos gerados em .github/
         +-- copilot-instructions.md
         +-- workflows/ quality-gate.yml · security-scan.yml
         +-- prompts/   run.prompt.md
         +-- skills/    speckit-baseline · speckit-stack · speckit-context-STORY-001
         +-- agents/    speckit-implementador · speckit-revisor

         🔧 DevTools: ESLint, Prettier e husky não detectados. Deseja gerar skill?
```

**Se a spec tiver lacunas:**

```
SpecKit: ⚠️ 3 lacunas encontradas — responda cada pergunta:

         1. Qual o valor de negócio?
Você:    Eliminar lag D+1, dashboards ao vivo
SpecKit: ✓ Atualizado.

         2. Quais requisitos não-funcionais?
Você:    P99 < 300ms, 1k eventos/min
SpecKit: ✓ Atualizado.

         3. Qual a arquitetura?
Você:    Hexagonal
SpecKit: ✓ Todas as lacunas preenchidas. Execute /validate novamente.
```

### Passo 4 — Gate 0: Alinhamento

Abra um **novo chat** → selecione o agent **speckit-implementador** no dropdown.

```
Você:    Implementar STORY-001
Agente:  Lendo spec .speckit/STORY-001.md...

         📋 Plano de implementação:
         TASK-1: Criar consumer Kafka para movimentacoes.v1
         TASK-2: Implementar engine de regras (4 tipos)
         TASK-3: Persistir comissão em PostgreSQL
         TASK-4: Emitir evento comissoes.calculadas.v1
         TASK-5: Testes e DLQ

         Riscos identificados:
         - Regras escalonadas podem ter edge cases nos limites de faixa
         - Dedup por movimentacaoId precisa de constraint no banco

         Confirma o plano? (sim/não)
Você:    sim
Agente:  ✅ Gate 0 concluído. Iniciando Gate 1...
```

### Passo 5 — Gate 1: Implementação

O agente implementa task por task com commits atômicos:

```
Agente:  📋 TASK-1 — Criar consumer Kafka
         feat(STORY-001): TASK-1 — consumer movimentacoes.v1 ✅

         📋 TASK-2 — Implementar engine de regras
         feat(STORY-001): TASK-2 — engine com 4 tipos de regra ✅

         📋 TASK-3 — Persistir comissão
         feat(STORY-001): TASK-3 — repository + migration ✅

         📋 TASK-4 — Emitir evento
         feat(STORY-001): TASK-4 — producer comissoes.calculadas.v1 ✅

         📋 TASK-5 — DLQ
         feat(STORY-001): TASK-5 — DLQ com causa no header ✅

         ✅ Gate 1 concluído. Iniciando Gate 2...
```

### Passo 6 — Gate 2: Testes

```
Agente:  📋 Testes — STORY-001
         Happy path: 6 critérios de aceite → 12 testes
         Edge cases: limites de faixa, valor zero, categoria inexistente → 8 testes
         Error cases: evento inválido, DLQ, timeout → 6 testes

         ./mvnw verify → BUILD SUCCESS
         Cobertura: 91% (mínimo: 80%) ✅
         26 testes passando, 0 falhas ✅

         Tentativa de commit automático do Gate 2:
         speckit: test(STORY-001): fechamento do gate 2 ✅

         Handoff no chat:
         ✅ Gates 0-2 concluídos
         🔁 Handoff: IMPLEMENTADOR → REVISOR
         🚪 Gate atualizado: 2 → 3
         📌 Status atualizado: in-progress/open → review

         ✅ Gate 2 concluído. Próximo: Gate 3 (abra nova sessão → agent revisor).
```

### Passo 7 — Gate 3: Revisão

Abra **novo chat** → selecione o agent **speckit-revisor** no dropdown. O revisor não participou da implementação.

```
Você:    Revisar STORY-001
Agente:  📋 Checklist de Revisão (11 dimensões)

         1. ✅ Funcionalidade — 6/6 critérios de aceite verificados
         2. ✅ Arquitetura — Hexagonal, sem imports cross-layer
         3. ✅ Qualidade de código — Nomeação consistente, sem dead code
         4. ✅ Testes — 26 testes, cobertura 91%
         5. ✅ Segurança — Sem PII em logs, credenciais via env vars
         6. ✅ Observabilidade — Health check, logs JSON com traceId
         7. ✅ NFRs — P99 validado via benchmark
         8. ✅ Git — Branch naming ok, Conventional Commits ok
         9. ✅ DoD — Todos os itens verificados
         10. ✅ VEREDITO: APROVADO
         11. — Revalidação: N/A (aprovado na primeira revisão)

         ✅ Gate 3 concluído. Prosseguir para Gate 4.
```

### Passo 8 — Gate 4: Entrega

```
Agente:  📋 Gate 4 — Entrega

         1. Rebase na main... ✅ (sem conflitos)
         2. Re-execução de testes... 26 passed, 0 failed ✅
         3. Verificação DoD item por item... 7/7 ✅
         4. Commit de encerramento:
            feat(STORY-001): entrega — cálculo de comissão a partir de eventos Kafka

         ✅ Story STORY-001 entregue. Status: done.
```

> **Dica:** Para features pequenas, use `run.prompt.md` (Stories) ou `fix-run.prompt.md` (Fixes) via ▶ Run in Copilot Chat para executar todos os gates em uma sessão única.

---

## Exemplos práticos

<details>
<summary><strong>Story via /draft (elicitação por texto livre)</strong></summary>

### Sequência: /draft → elicitação → /validate

```
  Voce                        @speckit                    Copilot Agente
   |                             |                             |
   |  /draft "Calcular           |                             |
   |   comissao via Kafka"       |                             |
   |---------------------------->|                             |
   |    elicit-story-001.prompt  |                             |
   |<----------------------------|                             |
   |                             |  Abra em Novo Chat Agente  |
   |--------------------------------------------------------->|
   |                             |                             |
   |              +---- loop 6 Fases (1 pergunta por vez) ----+
   |              |  Pergunta Negocio/Funcional/NFR/Tech/DoR  ||
   |<---------------------------------------------------------|
   |  Responde    |                                           ||
   |--------------------------------------------------------->|
   |              |  Registrado. Proxima...                   ||
   |<---------------------------------------------------------|
   |              +-------------------------------------------+
   |                             |    STORY-001.md criado      |
   |<---------------------------------------------------------|
   |                             |                             |
   |  /validate                  |                             |
   |---------------------------->|                             |
   |    DoR atingido — 9 arqs    |                             |
   |<----------------------------|                             |
   |                             |  Novo Chat → implementador  |
```

**Input:**

```
@speckit /draft Quero calcular comissão de vendedores baseado em eventos Kafka quando uma venda é concluída
```

**Trecho da entrevista (Fase 1 — Requisito de Negócio):**

| Passo | Agente pergunta        | Você responde                                                               |
| ----- | ---------------------- | --------------------------------------------------------------------------- |
| 1.1   | Qual dor isso resolve? | Cálculo em batch noturno, visibilidade D+1, atraso no fechamento financeiro |
| 1.2   | Por que agora?         | Time comercial pedindo há 3 meses, pressão crescente                        |
| 1.3   | Que KPI muda?          | Tempo venda → comissão: de D+1 para < 5 min                                 |
| 1.4   | Stakeholders?          | Comercial, Financeiro, Plataforma de Dados                                  |

> As fases 2–5 seguem o mesmo padrão: uma pergunta por vez, resumo ao final de cada fase, confirmação antes de avançar.
>
> **Fase 6** — Agente monta o `STORY-001.md` completo e instrui: _"Execute `@speckit /validate`"_.

</details>

<details>
<summary><strong>Fix via /draft (detecção automática de intent)</strong></summary>

### Sequência: /draft → elicitação fix → /validate

```
  Voce                        @speckit                    Copilot Agente
   |                             |                             |
   |  /draft "Login OAuth2       |                             |
   |   retorna 500 apos token"   |                             |
   |---------------------------->|                             |
   |                     Detecta keyword "500" → intent fix    |
   |    elicit-fix-001.prompt    |                             |
   |<----------------------------|                             |
   |                             |  Abra em Novo Chat Agente  |
   |--------------------------------------------------------->|
   |                             |                             |
   |              +---- loop 7 Fases -------------------------+
   |              |  Bug/Hipotese/Impacto/Regressao/Ctx/DoF   ||
   |<---------------------------------------------------------|
   |  Responde    |                                           ||
   |--------------------------------------------------------->|
   |              +-------------------------------------------+
   |                             |    FIX-001.md criado        |
   |<---------------------------------------------------------|
   |                             |                             |
   |  /validate                  |                             |
   |---------------------------->|                             |
   |    Fix valido — 7 arqs      |                             |
   |<----------------------------|                             |
   |                             |  Novo Chat → fix-implem.    |
```

**Input:**

```
@speckit /draft O login OAuth2 retorna 500 após expiração do token de refresh
```

O SpecKit detecta `retorna 500` e roteia para fix automaticamente, sem `--fix`.

**Trecho da entrevista (Fase 1 — Bug Description):**

| Passo | Agente pergunta         | Você responde                                                             |
| ----- | ----------------------- | ------------------------------------------------------------------------- |
| 1.1   | Sintomas e stack trace? | `TokenExpiredError: jwt expired` no servidor, cliente recebe 500 genérico |
| 1.2   | Quando começou?         | Após deploy de sexta-feira — regressão                                    |
| 1.3   | Passos para reproduzir? | 1. Auth OAuth2 → 2. Esperar 1h → 3. Qualquer request. 100% reproduzível   |
| 1.4   | Workaround?             | Logout + login resolve                                                    |
| 1.5   | Urgência?               | Cliente enterprise, resolver no dia                                       |

> Fases 2–6 aprofundam hipótese, impacto, regressão e DoF. **Fase 7** monta o `FIX-001.md`.

</details>

<details>
<summary><strong>Story via /new (template direto) — completa e incompleta</strong></summary>

### Story completa — vai direto para geração

Serviço backend: consome eventos Kafka de movimentação de vendas, calcula comissão em 4 tipos de regra, persiste e emite evento.

| Passo | Ação                                                                 |
| ----- | -------------------------------------------------------------------- |
| 1     | `@speckit /new` → cria `.speckit/STORY-001.md`                       |
| 2     | Preencha todos os campos (ver template abaixo)                       |
| 3     | `@speckit /validate` → DoR atingido → gera `.github/` (9 arquivos)   |
| 4     | Copilot Chat → selecione agent **speckit-implementador** (Gates 0–2) |
| 5     | Novo Chat → selecione agent **speckit-revisor** (Gates 3–4)          |

<details>
<summary>Template preenchido: <code>.speckit/STORY-001.md</code></summary>

```markdown
# História 001

<!-- metadata
id: 001
title: Cálculo de comissão a partir de eventos Kafka de movimentação
createdAt: 2026-03-19
version: 1
-->

---

## Requisito de Negócio

### Problema

O cálculo de comissões é executado em batch noturno, causando visibilidade defasada para o time comercial
e atraso no fechamento financeiro do mês.

### Valor

Cálculo de comissão em tempo real, por evento de movimentação, eliminando o lag de D+1. Habilita dashboards
de comissão ao vivo para o time comercial e antecipa em até 24h o fechamento financeiro mensal.

### Stakeholders

- Time Comercial (visibilidade de comissão em tempo real)
- Financeiro (fechamento mensal mais rápido)
- Plataforma de Dados (consumo do evento de saída para o data lake)

---

## Especificação Funcional

### User Stories

- Como sistema, ao receber evento no tópico `movimentacoes.v1`, quero classificar em um dos 4 tipos de regra e calcular a comissão
- Como sistema, quero persistir a comissão para histórico auditável
- Como sistema, quero emitir evento `comissoes.calculadas.v1` para consumidores downstream

### Critérios de Aceite

- Consumir `movimentacoes.v1`: `{ movimentacaoId, vendedorId, produtoId, categoriaId, valor, timestamp }`
- TAXA_FIXA: percentual fixo sobre o valor
- ESCALONADA: faixas progressivas (2% até R$10k, 3% R$10k–R$50k, 4% acima)
- COM_TETO: percentual com valor máximo (5% limitado a R$500)
- BONUS_CATEGORIA: bônus fixo por categoria elegível
- Idempotente: mesmo `movimentacaoId` não gera duplicata
- Evento inválido → DLQ `movimentacoes.v1.dlq` com causa no header

### Fora de Escopo

- Pagamento das comissões
- API REST de consulta
- Recálculo retroativo
- Configuração de regras via API

---

## Especificação Não-Funcional

### Performance

P99 < 300ms por evento. 1.000 eventos/min por partição.

### Segurança

Sem PII nos logs. Payload validado contra schema. Credenciais via env vars.

### Escalabilidade

Consumer group Kafka: 10 partições.

### Usabilidade

N/A — system-to-system.

### Disponibilidade

99,5% uptime. Retry com backoff exponencial (3x, 500ms inicial).

---

## Especificação Técnica

### Linguagem

java

### Framework

springboot

### Arquitetura

hexagonal

### Target

backend

### Banco de Dados

PostgreSQL 15

### Infraestrutura

Apache Kafka (AWS MSK), Docker, Kubernetes (EKS), GitHub Actions

---

## DoR — Definition of Ready

- [x] Requisito de negócio documentado e aprovado
- [x] User stories com critérios de aceite mensuráveis
- [x] Escopo delimitado
- [x] Requisitos não-funcionais definidos
- [x] Stack técnica decidida
- [x] Padrão arquitetural definido
- [x] DoD acordado com o time

---

## DoD — Definition of Done

- Todos os critérios de aceite validados por testes automatizados
- Cobertura ≥ 80%
- 4 regras validadas com casos numéricos explícitos
- Idempotência verificada
- DLQ funcional com causa no header
- Evento `comissoes.calculadas.v1` validado
- Sem PII nos logs
- Commit em `feature/001-calculo-comissao-kafka`
```

</details>

#### Arquivos gerados para Java + Kafka + PostgreSQL + backend

```
.github/  (9 arquivos)
+-- copilot-instructions.md
+-- workflows/  quality-gate.yml · security-scan.yml
+-- prompts/    run.prompt.md
+-- skills/     speckit-baseline · speckit-stack · speckit-context-STORY-001
+-- agents/     speckit-implementador · speckit-revisor
```

---

### Story incompleta — fluxo de alinhamento

```
  Voce                                           @speckit
   |                                                |
   |  /validate (story com lacunas)                 |
   |----------------------------------------------->|
   |                          6 lacunas encontradas |
   |<-----------------------------------------------|
   |                                                |
   |  Lacuna 1 — Valor de negocio?                  |
   |<-----------------------------------------------|
   |  "Eliminar lag D+1, dashboards ao vivo"        |
   |----------------------------------------------->|
   |                                                |
   |  Lacuna 2 — Tipos de regra de comissao?        |
   |<-----------------------------------------------|
   |  "Taxa fixa, escalonada, teto, bonus"          |
   |----------------------------------------------->|
   |                                                |
   |  Lacuna 3 — Fora de escopo?                    |
   |<-----------------------------------------------|
   |  "Pagamento, API REST, recalculo"              |
   |----------------------------------------------->|
   |                                                |
   |  Lacuna 4 — SLA de performance?                |
   |<-----------------------------------------------|
   |  "P99 < 300ms, 1k eventos/min"                 |
   |----------------------------------------------->|
   |                                                |
   |  Lacuna 5 — Arquitetura?                       |
   |<-----------------------------------------------|
   |  "Hexagonal"                                   |
   |----------------------------------------------->|
   |                                                |
   |  Lacuna 6 — DoD?                               |
   |<-----------------------------------------------|
   |  "Idempotencia, DLQ, sem PII, branch"          |
   |----------------------------------------------->|
   |                  Todas as lacunas preenchidas   |
   |                                                |
   |  /validate (novamente)                         |
   |----------------------------------------------->|
   |               DoR atingido — 9 arquivos gerados|
   |<-----------------------------------------------|
```

</details>

<details>
<summary><strong>Fix via /fix (template direto) — completo e incompleto</strong></summary>

### Fix completo — vai direto para geração

| Passo | Ação                                                                     |
| ----- | ------------------------------------------------------------------------ |
| 1     | `@speckit /fix` → cria `.speckit/FIX-001.md`                             |
| 2     | Preencha todos os campos (ver template abaixo)                           |
| 3     | `@speckit /validate` → Fix válido → gera `.github/` (7 arquivos)         |
| 4     | Copilot Chat → selecione agent **speckit-fix-implementador** (Gates 0–2) |
| 5     | Novo Chat → selecione agent **speckit-fix-revisor** (Gates 3–4)          |

<details>
<summary>Template preenchido: <code>.speckit/FIX-001.md</code></summary>

```markdown
# Fix 001

<!-- metadata
id: 001
title: Login OAuth2 retorna 500 após expiração do token
createdAt: 2026-03-19
version: 1
type: fix
status: open
-->

## Bug Description

### Título do Bug

Login OAuth2 retorna erro 500 quando token expirado

### Sintomas

`/api/auth/callback` retorna HTTP 500 ao invés de 401 com token expirado.
Cliente recebe erro genérico e é deslogado sem mensagem.

### Passos para Reproduzir

1. Autenticar via GitHub OAuth2
2. Aguardar token expirar (1h)
3. Qualquer requisição autenticada → 500

### Ambiente Afetado

Production — Node.js 20, Express 4.18, Ubuntu 22.04

### Frequência de Ocorrência

100% reproduzível após expiração.

---

## Root Cause Hypothesis

### Hipótese

Middleware não trata `TokenExpiredError` do JWT. Erro propaga sem handler → Express retorna 500.

### Arquivos/Componentes Suspeitos

- `src/middleware/auth.ts`
- `src/routes/auth.ts`

---

## Impact Assessment

### Severidade

high

### Usuários/Sistemas Afetados

~60% dos usuários ativos/dia (sessões > 1h).

### Risco de Regressão

Middleware impacta: refresh token, API key auth, rotas públicas opcionais.

---

## Regression Prevention

### Testes a Adicionar

- Unitário: middleware retorna 401 para `TokenExpiredError`
- Unitário: middleware retorna 401 para `JsonWebTokenError`
- Integração: `GET /api/me` com token expirado → 401 + `{ error: "token_expired" }`
- Integração: `GET /api/me` com token válido continua OK

---

## DoF — Definition of Fixed

- [ ] Bug não reproduz com passos documentados
- [ ] Root cause endereçado (não apenas patched)
- [ ] Testes de regressão passando
- [ ] Cobertura ≥ 80%
- [ ] Commit em `fix/001-oauth2-token-expired-500`
```

</details>

> A **stack técnica é detectada automaticamente** do workspace (`package.json`, `pom.xml`, etc.).

---

### Fix incompleto — fluxo de alinhamento

```
  Voce                                           @speckit
   |                                                |
   |  /validate (fix com lacunas)                   |
   |----------------------------------------------->|
   |                          4 lacunas encontradas |
   |<-----------------------------------------------|
   |                                                |
   |  Lacuna 1 — Passos para reproduzir?            |
   |<-----------------------------------------------|
   |  "Relatorio > Exportar PDF. TypeError"         |
   |----------------------------------------------->|
   |                                                |
   |  Lacuna 2 — Hipotese da causa raiz?            |
   |<-----------------------------------------------|
   |  "Firefox bloqueia window.print() em async"    |
   |----------------------------------------------->|
   |                                                |
   |  Lacuna 3 — Severidade?                        |
   |<-----------------------------------------------|
   |  "High — usado diariamente pelo financeiro"    |
   |----------------------------------------------->|
   |                                                |
   |  Lacuna 4 — Testes de regressao?               |
   |<-----------------------------------------------|
   |  "Unitario: print sincrono. Integracao: cliq" |
   |----------------------------------------------->|
   |                       Todas as lacunas preench. |
   |                                                |
   |  /validate (novamente)                         |
   |----------------------------------------------->|
   |                Fix valido — 7 arquivos gerados |
   |<-----------------------------------------------|
```

</details>

---

## Rastreabilidade e auditoria

O SpecKit mantém dois mecanismos de rastreio persistentes no workspace:

### Audit Log

Todo comando executado é registrado automaticamente em `.speckit/audit.log` com timestamp, comando e resultado.

```
.speckit/
+-- audit.log
```

**Acessar:** `@speckit /audit` ou `@speckit /audit 50`

**Formato de cada linha:**

```
2026-03-19T10:15:00Z [command] /validate
2026-03-19T10:15:01Z [command] /validate — ok
```

**Casos de uso:**

- Auditoria de compliance — "quem fez o quê e quando"
- Debugging de problemas — "o último comando executado antes do erro"
- Métricas de uso — quantos /validate vs /new por sessão

### Trace (Rastreabilidade por Spec)

Cada spec tem seu próprio registro de rastreabilidade com todas as transições de estado.

```
.speckit/
+-- traces/
    +-- STORY-001.trace.json
    +-- STORY-002.trace.json
    +-- FIX-001.trace.json
```

**Acessar:** `@speckit /trace` (lista) ou `@speckit /trace STORY-001` (detalhe)

**O que é rastreado:**
| Evento | Descrição | Exemplo |
|---|---|---|
| `created` | Spec criada | `/new` ou `/draft` |
| `validated` | Validação executada | `/validate` — DoR atingido |
| `gate-transition` | Mudança de gate | Gate 1 → Gate 2 |
| `status-change` | Mudança de status | `in-progress` → `review` |
| `agent-change` | Modo de agente alterado | `default` → `implementador` |

### Session Logging

Além do audit log e traces, o plugin grava logs de sessão em Markdown:

```
.speckit/
+-- logs/
    +-- session-2026-03-19.md
```

Cada entrada contém o comando executado, o resultado e metadados relevantes. Útil para revisão pós-sessão.

> Limitação de plataforma: a API atual de Chat Participant do VS Code/Copilot não permite renomear programaticamente o título nativo da conversa.
> Para facilitar navegação no histórico, o SpecKit grava e exibe um alias canônico de sessão no formato `Story + Agente + Gate` via `/history` e session logs.

---

## Referência rápida — o que dizer ao agente

### Criando specs

| Você quer...                  | Diga                                                   |
| ----------------------------- | ------------------------------------------------------ |
| Criar story por texto livre   | `@speckit /draft Quero calcular comissão via Kafka`    |
| Criar story por template      | `@speckit /new`                                        |
| Criar fix por texto livre     | `@speckit /draft Login retorna 500 após expirar token` |
| Criar fix por template        | `@speckit /fix`                                        |
| Validar e gerar arquivos      | `@speckit /validate`                                   |
| Ver todas as specs abertas    | `@speckit /status`                                     |
| Incluir concluídas/canceladas | `@speckit /status --all`                               |
| Ver histórico agregado        | `@speckit /history`                                    |

### Trabalhando com gates

| Você quer...              | Diga                                           |
| ------------------------- | ---------------------------------------------- |
| Ver regras de gate        | `@speckit /gate`                               |
| Validar se pode avançar   | `@speckit /gate check gate 1 2`                |
| Validar mudança de status | `@speckit /gate check status open in-progress` |

### Controlando o agente

| Você quer...                 | Diga                            |
| ---------------------------- | ------------------------------- |
| Entrar em modo debugger      | `@speckit /agent debugger`      |
| Entrar em modo refactor      | `@speckit /agent refactor`      |
| Entrar em modo implementador | `@speckit /agent implementador` |
| Entrar em modo revisor       | `@speckit /agent revisor`       |
| Voltar ao modo padrão        | `@speckit /agent default`       |
| Ver modo ativo               | `@speckit /agent`               |

### Git e contexto

| Você quer...             | Diga                                                   |
| ------------------------ | ------------------------------------------------------ |
| Ver alterações pendentes | `@speckit /diff`                                       |
| Ver diff completo        | `@speckit /diff --full`                                |
| Commitar com prefixo     | `@speckit /commit feat(STORY-001): implementar engine` |
| Adicionar contexto       | `@speckit /context add src/auth/service.ts`            |
| Listar contexto ativo    | `@speckit /context`                                    |
| Limpar contexto          | `@speckit /context clear`                              |

### Diagnóstico e rastreio

| Você quer...                 | Diga                        |
| ---------------------------- | --------------------------- |
| Verificar saúde do workspace | `@speckit /doctor`          |
| Ver log de auditoria         | `@speckit /audit`           |
| Ver últimas N entradas       | `@speckit /audit 50`        |
| Ver rastreabilidade          | `@speckit /trace`           |
| Detalhes de uma spec         | `@speckit /trace STORY-001` |

---

## FAQ

<details>
<summary><strong>Posso usar o SpecKit sem GitHub Copilot?</strong></summary>

Não. O SpecKit é um Chat Participant do GitHub Copilot Chat. Requer a extensão **GitHub Copilot Chat** instalada e ativa no VS Code `^1.93.0`.

</details>

<details>
<summary><strong>Preciso de workspace aberto?</strong></summary>

Sim. O SpecKit requer ao menos uma pasta aberta no VS Code. Sem workspace carregado, todos os comandos retornam erro informando que é necessário abrir uma pasta.

</details>

<details>
<summary><strong>Posso ter múltiplas stories/fixes abertas ao mesmo tempo?</strong></summary>

Sim. O plugin rastreia múltiplas specs no diretório `.speckit/`. Use `@speckit /status` para ver todas. A validação (`/validate`) atua sobre a spec ativa (a mais recente, ou a última referenciada).

</details>

<details>
<summary><strong>O /draft detecta automaticamente se é story ou fix?</strong></summary>

Sim. O `/draft` analisa o texto fornecido e detecta intent:

- Keywords de bug (500, erro, falha, crash, timeout, regressão) → roteia para **fix**
- Demais textos → roteia para **story**
- Se houver ambiguidade, você pode forçar com `--fix` ou `--story`

</details>

<details>
<summary><strong>Como o plugin detecta a stack técnica?</strong></summary>

Automaticamente via análise de arquivos no workspace:

| Arquivo detectado                     | Stack inferida |
| ------------------------------------- | -------------- |
| `package.json` + `tsconfig.json`      | TypeScript     |
| `package.json` (sem tsconfig)         | JavaScript     |
| `pom.xml`                             | Java           |
| `*.csproj` / `*.sln`                  | C#             |
| `pyproject.toml` / `requirements.txt` | Python         |

Framework e banco de dados são inferidos a partir de dependências no manifesto.

</details>

<details>
<summary><strong>Os arquivos gerados sobrescrevem meus .github/ existentes?</strong></summary>

Sim — o plugin gera os arquivos dentro de `.github/` e sobrescreve os existentes para manter consistência com a spec validada. Antes de cada geração, é criado um backup em `.speckit/backups/` com timestamp.

O backup inclui:

- Diretório `.github/` completo
- Arquivo spec (`.speckit/STORY-*.md` ou `.speckit/FIX-*.md`)
- Retenção: até **20 backups** ou **60 dias** (o que vier primeiro)

</details>

<details>
<summary><strong>O que é o DevTools skill?</strong></summary>

Quando o `/validate` detecta que o workspace não possui ESLint, Prettier, husky ou lint-staged configurados, ele oferece gerar um skill adicional:

```
🔧 DevTools: ferramentas não detectadas. Gerar skill speckit-devtools?
```

O skill `speckit-devtools` instrui o agente a configurar essas ferramentas adaptadas à stack do projeto.

</details>

<details>
<summary><strong>Qual a diferença entre /agent implementador e o agent no dropdown?</strong></summary>

| Mecanismo                                  | O que faz                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `@speckit /agent implementador`            | Injeta guardrails resumidos e protocolos na sessão do Chat Participant                  |
| Agent **speckit-implementador** (dropdown) | Carrega o protocolo completo de Gates 0-2 como .agent.md com todas as regras detalhadas |

Para implementação real, use o **dropdown** (protocolo completo). O `/agent` é útil para ativar rapidamente guardrails em sessões informais.

</details>

<details>
<summary><strong>Posso pular gates?</strong></summary>

Não. As transições de gate são controladas e cada avanço é no máximo +1. Use `@speckit /gate check gate 0 3` para verificar — retornará `❌ Transição bloqueada`.

Para validar transições permitidas: `@speckit /gate`

</details>

<details>
<summary><strong>O que acontece se eu fechar o VS Code no meio de um gate?</strong></summary>

O estado da spec (gate atual, status) é persistido no arquivo `.speckit/STORY-*.md` ou `FIX-*.md` e nos traces. Ao reabrir, continue de onde parou.

O modo do agente (`/agent`) volta para `default` ao reiniciar o VS Code, pois é mantido em memória da sessão.

</details>

<details>
<summary><strong>Como reverto para uma versão anterior da spec?</strong></summary>

Os backups ficam em `.speckit/backups/` com timestamp. Copie o arquivo desejado de volta para `.speckit/` e execute `/validate` novamente.

</details>

<details>
<summary><strong>O plugin funciona com múltiplos workspaces (multi-root)?</strong></summary>

Atualmente o plugin opera sobre o **primeiro workspace carregado**. Suporte completo a multi-root com SQLite está planejado para uma versão futura.

</details>

<details>
<summary><strong>O `/commit` faz push automaticamente?</strong></summary>

Não. O `/commit` apenas executa stage + commit local (prefixo `speckit:`). O push é deliberadamente manual para permitir revisão antes de enviar ao remote. Se você omitir a mensagem, o SpecKit tenta derivar uma mensagem automática da spec ativa e do gate atual.

</details>

<details>
<summary><strong>Como debugar problemas com o plugin?</strong></summary>

1. Execute `@speckit /doctor` para verificar a saúde do workspace
2. Consulte `@speckit /audit` para ver o histórico de comandos e erros
3. Verifique os logs de sessão em `.speckit/logs/session-*.md`
4. Se necessário, verifique o Output Channel do VS Code (View → Output → selecione "SpecKit")

</details>

---

## Limitações conhecidas

| Limitação                                                                | Status             | Workaround                             |
| ------------------------------------------------------------------------ | ------------------ | -------------------------------------- |
| Multi-root workspace: opera apenas no primeiro workspace carregado       | Planejado (SQLite) | Abrir um workspace por vez             |
| Modo do agente (`/agent`) não persiste entre reinicializações do VS Code | By design          | Re-executar `/agent <modo>` ao reabrir |
| Transições automáticas de gate para Fix ainda são manuais                | Planejado          | Atualizar metadata do FIX no Gate 4    |
| Sem telemetria interna do plugin (métricas de uso)                       | Planejado (opt-in) | Usar audit log para rastreio manual    |
| Sem `CONTRIBUTING.md` para contribuições externas                        | Planejado          | —                                      |
| Sem CI/CD own pipeline (GitHub Actions para o repo do plugin)            | Planejado          | Build e lint locais                    |

---

## Matriz de maturidade

Avaliação baseada na versão **0.3.1** do plugin com evidências verificáveis do código-fonte.

### Visão geral

| Dimensão            | Nível       | Score |
| ------------------- | ----------- | ----- |
| Arquitetura         | Avançado    | 5/5   |
| Qualidade de código | Avançado    | 5/5   |
| Testes              | Avançado    | 5/5   |
| Segurança           | Avançado    | 5/5   |
| Funcionalidades     | Avançado    | 4/5   |
| Observabilidade     | Consolidado | 4/5   |
| Documentação        | Consolidado | 4/5   |
| DevOps / Linting    | Consolidado | 4/5   |
| Resiliência / Erros | Avançado    | 5/5   |

### Detalhamento por dimensão

<details>
<summary><strong>Arquitetura — 5/5</strong></summary>

| Critério                 | Status | Evidência                                                       |
| ------------------------ | ------ | --------------------------------------------------------------- |
| SOLID compliance         | OK     | Generators sao funcoes puras; Single Responsibility por arquivo |
| Dependency Inversion     | OK     | IFileSystem + IWorkspace injetados em todos os commands         |
| Composicao sobre heranca | OK     | Nenhuma heranca entre generators; composicao via parametro      |
| Separacao de camadas     | OK     | Parser, Validator, Generator, FileSystem em modulos distintos   |
| Extension Host safety    | OK     | Nenhum bloqueio sincrono; async/await em todo I/O               |
| Disposal correto         | OK     | context.subscriptions.push em todas as subscriptions            |

</details>

<details>
<summary><strong>Qualidade de codigo — 5/5</strong></summary>

| Critério                  | Status | Evidência                                           |
| ------------------------- | ------ | --------------------------------------------------- |
| TypeScript strict mode    | OK     | tsconfig.json: strict: true                         |
| Parser single-pass        | OK     | BaseParser com regex compilado em nivel de modulo   |
| Idempotencia de geracao   | OK     | Mesmos inputs geram mesmos outputs sem side effects |
| Sem credenciais hardcoded | OK     | Zero ocorrencias em src/                            |
| Encoding cross-platform   | OK     | Suporte a CRLF, LF e CR via LineEndings tests       |
| Tamanho de arquivos       | OK     | Nenhum arquivo src/ excede 300 linhas               |

</details>

<details>
<summary><strong>Testes — 5/5</strong></summary>

| Critério                          | Status       | Evidência                                                               |
| --------------------------------- | ------------ | ----------------------------------------------------------------------- |
| Testes unitarios                  | 794 passando | 53 arquivos de teste cobrindo parsers, validators, generators, commands |
| Testes de integracao              | OK           | @vscode/test-electron com workspace isolado                             |
| Testes comportamentais            | OK           | E2E com Anthropic API real; valida pipeline completo                    |
| Fixtures reutilizaveis            | OK           | 11 fixtures em tests/fixtures/ (completo, parcial, vazio, H4)           |
| Mocks isolados                    | OK           | tests/**mocks**/vscode.ts com VS Code API completa                      |
| Edge cases                        | OK           | Line endings, campos vazios, severity invalida, story parcial           |
| Comportamento sobre implementacao | OK           | Testes verificam resultado, nao detalhes internos                       |

</details>

<details>
<summary><strong>Seguranca — 5/5</strong></summary>

| Critério                     | Status | Evidência                                             |
| ---------------------------- | ------ | ----------------------------------------------------- |
| Generators de seguranca      | OK     | CredentialSecurityGenerator + SecurityTestsGenerator  |
| IAM e rotacao de credenciais | OK     | Regras para AWS Secrets Manager, Key Vault, Vault     |
| Input validation             | OK     | StoryValidator e FixValidator com campos obrigatorios |
| HTML sanitization            | OK     | Parser remove HTML comments via regex seguro          |
| Pre-commit hooks gerados     | OK     | git-secrets + trufflehog nas instrucoes geradas       |
| SAST/SCA no CI               | OK     | security-scan.yml com Semgrep + TruffleHog            |

</details>

<details>
<summary><strong>Funcionalidades — 4/5</strong></summary>

| Critério              | Status  | Evidência                                                             |
| --------------------- | ------- | --------------------------------------------------------------------- |
| Commands core         | 5/5     | /new, /fix, /draft, /validate, /status                                |
| Linguagens suportadas | 5/5     | TypeScript, JavaScript, Java, C#, Python                              |
| Frameworks suportados | 5/5     | React, Angular, SpringBoot, .NET, FastAPI                             |
| Infraestrutura        | 3/3     | AWS, Kafka, Glue Job                                                  |
| Patterns              | 3/3     | BFF, CRUD, Contract Testing                                           |
| CI/CD gerado          | OK      | quality-gate.yml + security-scan.yml por linguagem                    |
| Agents autonomos      | OK      | Implementador + Revisor para Story e Fix                              |
| DevTools assessment   | OK      | /validate avalia ESLint, Prettier, husky, lint-staged e oferece skill |
| Multi-workspace       | Parcial | Funciona por workspace aberto; sem SQLite ainda                       |

</details>

<details>
<summary><strong>Observabilidade — 4/5</strong></summary>

| Critério                   | Status  | Evidência                                           |
| -------------------------- | ------- | --------------------------------------------------- |
| Log estruturado            | OK      | SessionLogger grava .speckit/logs/session-<date>.md |
| Health check gerado        | OK      | Liveness + Readiness nos prompts                    |
| Metricas geradas           | OK      | Prometheus /metrics nas instrucoes                  |
| Tracing distribuido        | OK      | W3C traceparent propagation                         |
| Kafka consumer lag         | OK      | Monitoramento + threshold de alerta                 |
| Metricas do proprio plugin | Ausente | Sem telemetria interna do plugin                    |

</details>

<details>
<summary><strong>Documentacao — 4/5</strong></summary>

| Critério                  | Status  | Evidência                                        |
| ------------------------- | ------- | ------------------------------------------------ |
| README usuario            | OK      | Guia completo com diagramas, exemplos, templates |
| JSDoc em funcoes criticas | OK      | BaseParser, generators, test headers             |
| Templates documentados    | OK      | Story e Fix com todos os campos                  |
| Gates documentados        | OK      | 5 gates com descricao detalhada                  |
| Limitacoes conhecidas     | Ausente | Sem secao de limitacoes ou troubleshooting       |
| Contribuicao              | Ausente | Sem CONTRIBUTING.md                              |

</details>

<details>
<summary><strong>DevOps / Linting — 4/5</strong></summary>

| Critério                | Status  | Evidência                                                           |
| ----------------------- | ------- | ------------------------------------------------------------------- |
| ESLint configurado      | OK      | eslint.config.mjs (flat config v10) + typescript-eslint             |
| Prettier configurado    | OK      | .prettierrc + .prettierignore                                       |
| npm run lint            | OK      | `lint`, `lint:fix`, `format`, `format:check` no package.json        |
| Pre-commit hooks locais | OK      | husky + lint-staged — executa ESLint + Prettier nos arquivos staged |
| CI lint gate            | Ausente | Sem GitHub Actions configurado para o repo do plugin                |

</details>

<details>
<summary><strong>Resiliencia / Erros — 5/5</strong></summary>

| Critério                | Status | Evidência                                                                        |
| ----------------------- | ------ | -------------------------------------------------------------------------------- |
| Generators idempotentos | OK     | Sem state mutation; safe to re-run                                               |
| Fallback em validacao   | OK     | Gaps reportados um a um ao usuario                                               |
| Filesystem errors       | OK     | try/catch em todos os commands (readFile, writeFile) com mensagem amigavel       |
| Spec size guard         | OK     | Aviso quando spec > 50 KB com dicas de otimizacao; fluxo nunca bloqueado         |
| Graceful degradation    | OK     | Generators com write individual try/catch; CancellationToken checado entre gates |

</details>

### Roadmap de melhoria

| Prioridade | Acao                                     | Dimensao impactada |
| ---------- | ---------------------------------------- | ------------------ |
| Media      | Secao de limitacoes conhecidas no README | Documentacao       |
| Media      | Automatizar transicoes de gate para Fix  | Funcionalidades    |
| Baixa      | Telemetria interna do plugin (opt-in)    | Observabilidade    |
| Baixa      | CONTRIBUTING.md                          | Documentacao       |
| Planejado  | SQLite para estado multi-workspace       | Funcionalidades    |
