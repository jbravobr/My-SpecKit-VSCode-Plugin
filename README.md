# SpecKit — Spec Driven Development

Plugin para VS Code que implementa o fluxo de **Spec Driven Development (SDD)**: você define uma História estruturada antes de escrever código, e o plugin gera automaticamente os arquivos de configuração do GitHub Copilot que "primam" a sessão com todo o contexto do projeto.

O Copilot passa a conhecer o requisito de negócio, critérios de aceite, restrições não-funcionais, stack técnica, padrão arquitetural, regras de teste e convenções de versionamento — antes de qualquer conversa começar.

---

## O problema que o SpecKit resolve

O GitHub Copilot responde ao prompt imediato sem entender o contexto estruturado do projeto. Ele não sabe qual é a arquitetura escolhida, quais são os critérios de aceite, quais convenções de código valem, quais requisitos não-funcionais existem ou como o time versiona o código.

O SpecKit resolve isso em duas etapas:

1. Você preenche uma História estruturada com tudo o que o Copilot precisa saber
2. O plugin gera arquivos `.github/instructions/` e `.github/prompts/` que o Copilot carrega automaticamente em toda sessão

Além do contexto da história, o plugin impõe **comportamentos baseline** que governam o agente em qualquer projeto: integridade, performance, arquitetura, anti-alucinação, padrões de teste e fluxo git.

---

## Pré-requisitos

- VS Code `^1.93.0`
- Extensão **GitHub Copilot Chat** instalada e ativa
- Node.js `>=18` (apenas para build a partir do fonte)

---

## Instalação

### Opção 1 — Via arquivo `.vsix` (recomendado)

1. Faça o download do arquivo `vscode-plugin-speckit-0.1.0.vsix` (ou gere um, veja abaixo)
2. No VS Code, abra a paleta de comandos (`Ctrl+Shift+P`)
3. Execute **"Extensions: Install from VSIX..."**
4. Selecione o arquivo `.vsix`

### Opção 2 — Carregar em modo desenvolvimento (F5)

Ideal para contribuir ou experimentar sem empacotar:

```bash
git clone <repositório>
cd vscode-plugin-speckit
npm install
npm run build
```

Abra a pasta no VS Code e pressione **F5**. Uma nova janela do VS Code abrirá com a extensão ativa.

---

## Build

### Compilar (desenvolvimento)

```bash
npm install
npm run build
```

Gera `dist/extension.js`.

### Modo watch (recompila ao salvar)

```bash
npm run watch
```

### Empacotar como `.vsix` (distribuição)

Instale o `vsce` globalmente se ainda não tiver:

```bash
npm install -g @vscode/vsce
```

Em seguida:

```bash
npm run package      # minifica para produção
vsce package         # gera o .vsix
```

O arquivo `vscode-plugin-speckit-0.1.0.vsix` será criado na raiz do projeto.

---

## Como usar

O SpecKit expõe um **Chat Participant** chamado `@speckit`. Todo o fluxo acontece no Copilot Chat.

### Fluxo completo

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

O usuário interage para:
1. Criar e escrever a história (`/new`)
2. Responder perguntas de alinhamento quando há lacunas
3. Abrir o **Copilot Chat em modo Agente** e digitar `/implement` (Sessão A)
4. Confirmar o plano antes de o agente começar a codificar
5. Executar `@speckit /review` e abrir **novo Copilot Chat em modo Agente** com `/review` (Sessão B)

---

### `@speckit /new`

Cria o arquivo `.speckit/STORY-001.md` (numeração automática) e abre no editor.

O template contém todas as seções marcadas com `<!-- TODO -->`:

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

| Framework | Arquivo gerado | Aplica-se a |
|---|---|---|
| `dotnet` | `fw-dotnet.instructions.md` | ASP.NET Core: DI, async, Clean Architecture, IOptions, ILogger |
| `springboot` | `fw-springboot.instructions.md` | Spring Boot: constructor injection, JpaRepository, perfis, ControllerAdvice |
| `angular` | `fw-angular.instructions.md` | Angular: OnPush, Signals, RxJS, lazy loading, async pipe |
| `react` | `fw-react.instructions.md` | React: hooks, memo, useCallback/useMemo, react-hook-form + Zod |
| `fastapi` | `fw-fastapi.instructions.md` | FastAPI: APIRouter, Pydantic v2, async def, Depends(), HTTPException |
| `other` | *(não gera arquivo)* | Stack sem instrução de framework específica |

**Arquiteturas suportadas:** `hexagonal` · `layered` · `microservices` · `monolith` · `serverless`

---

### `@speckit /validate`

Lê a História mais recente em `.speckit/`, faz o parse e verifica:

- Campos obrigatórios preenchidos (título, problema, valor, user stories, critérios de aceite, stack técnica, DoD)
- Critérios do DoR marcados como `[x]`

**Se houver lacunas:** injeta no chat um prompt de alinhamento que instrui o Copilot a perguntar ao usuário uma lacuna por vez e atualizar o arquivo `.speckit/STORY-XXX.md` a cada resposta. Quando todas as lacunas estiverem fechadas, o agente orienta o usuário a executar `/validate` novamente.

**Se o DoR estiver atingido:** gera todos os arquivos `.github/` (baseline + linguagem + framework + story-specific + prompts) e instrui o usuário a abrir o Copilot Chat em modo **Agente** e digitar `/implement`. O agente apresenta o plano, aguarda confirmação, implementa e testa. Ao concluir, instrui o usuário a executar `@speckit /review`.

---

### `@speckit /apply`

Valida a Story e, se estiver completa, gera todos os arquivos de configuração do Copilot e instrui o usuário a abrir o Copilot Chat em modo **Agente** e digitar `/implement`:

```
.github/
├── copilot-instructions.md                    # Índice da sessão (≤ 30 linhas)
├── prompts/
│   ├── implement.prompt.md                    # Implementar feature (Sessão A — `/implement`)
│   ├── review.prompt.md                       # Revisar código (Sessão B — `/review`)
│   └── run.prompt.md                          # Fluxo autônomo completo (hotfixes/chores)
└── instructions/
    │
    │  ── BASELINE (sempre gerados) ──
    ├── 00-agent-integrity.instructions.md     # Comportamento do agente + portão de entrega
    ├── 01-performance.instructions.md         # Obsessão com eficiência algorítmica (Big-O)
    ├── 02-architecture.instructions.md        # Design, SOLID e estrutura de camadas
    ├── 03-context-management.instructions.md  # Anti-alucinação e janela de contexto
    ├── 04-testing-standards.instructions.md   # Cobertura ≥ 80%, cenários obrigatórios
    ├── 05-git-workflow.instructions.md        # Gitflow + Conventional Commits
    │
    │  ── LINGUAGEM (apenas a selecionada) ──
    ├── lang-typescript.instructions.md
    ├── lang-javascript.instructions.md
    ├── lang-java.instructions.md
    ├── lang-csharp.instructions.md
    └── lang-python.instructions.md
    │
    │  ── FRAMEWORK (apenas o selecionado) ──
    ├── fw-dotnet.instructions.md
    ├── fw-springboot.instructions.md
    ├── fw-angular.instructions.md
    ├── fw-react.instructions.md
    └── fw-fastapi.instructions.md
    │
    │  ── STORY-SPECIFIC (gerados a partir da story) ──
    ├── 10-business-context.instructions.md
    ├── 11-functional-spec.instructions.md
    ├── 12-nonfunctional-spec.instructions.md
    ├── 13-tech-stack.instructions.md
    ├── 14-architecture-pattern.instructions.md
    └── 15-dod-checklist.instructions.md
```

Os arquivos de instrução ficam em `.github/instructions/` e são carregados automaticamente pelo Copilot em toda sessão do workspace. Cada arquivo tem uma única responsabilidade e não ultrapassa ~80 linhas.

---

### `@speckit /review`

Inicia a **Sessão B** — revisão independente e entrega.

Deve ser executado quando o agente da Sessão A (implementação + testes) instruir o usuário com a mensagem *"Execute `@speckit /review`"*.

O comando instrui o usuário a abrir um novo Copilot Chat em modo **Agente** e digitar `/review`. O Copilot começa sem memória da Sessão A: lê a história, lista os arquivos modificados via `git diff`, lê cada arquivo e solicita o relatório de cobertura antes de iniciar o checklist. Após veredito APROVADO, executa a entrega (revalida testes, valida DoD e faz commit local).

---

### `@speckit /status`

Exibe um resumo da História ativa: título, ID, linguagem, framework, arquitetura e status de validação.

---

## Prompts gerados

Após `/apply`, três prompts ficam disponíveis em `.github/prompts/`.

| Prompt | Sessão | Como usar | Cobre |
|---|---|---|---|
| `implement.prompt.md` | **A** | Copilot Chat → modo Agente → `/implement` | Alinhamento + plano + confirmação + implementação + testes (portões 0–2) |
| `review.prompt.md` | **B** | Copilot Chat → modo Agente → `/review` | Revisão independente + entrega (portões 3–4) |
| `run.prompt.md` | — | Copilot Chat → modo Agente → `/run` | Todos os portões em sessão única (hotfixes, chores) |

> **Por que duas sessões?** O agente que implementou o código tem viés ao revisá-lo (anchoring bias). A **Sessão B** começa sem memória da implementação — lê apenas os artefatos produzidos — garantindo uma revisão genuinamente independente.

---

## Exemplo prático

História completa para servir de referência. Representa uma feature real e cobre todos os campos obrigatórios do template.

**Contexto:** serviço backend que consome eventos de movimentação de vendas via Kafka, classifica cada movimentação em um dos 4 tipos de regra de comissão, calcula o valor, persiste e emite um evento de resultado.

### Arquivo: `.speckit/STORY-001.md`

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
O cálculo de comissões é executado em batch noturno, causando visibilidade defasada para o time comercial e atraso no fechamento financeiro do mês. Movimentações processadas ao longo do dia só ficam refletidas nas comissões no dia seguinte.

### Valor
Cálculo de comissão em tempo real, por evento de movimentação, eliminando o lag de D+1. Habilita dashboards de comissão ao vivo para o time comercial e antecipa em até 24h o fechamento financeiro mensal.

### Stakeholders
- Time Comercial (visibilidade de comissão em tempo real)
- Financeiro (fechamento mensal mais rápido)
- Plataforma de Dados (consumo do evento de saída para o data lake)

---

## Especificação Funcional

### User Stories
- Como sistema, ao receber um evento de movimentação no tópico Kafka `movimentacoes.v1`, quero classificá-la em um dos 4 tipos de regra e calcular a comissão correspondente para que o resultado esteja disponível em tempo real
- Como sistema, quero persistir a comissão calculada no banco de dados para que o histórico seja auditável
- Como sistema, quero emitir um evento `comissoes.calculadas.v1` após o cálculo para que consumidores downstream (dashboard, data lake) sejam notificados imediatamente

### Critérios de Aceite
- Consumir eventos do tópico Kafka `movimentacoes.v1` com schema: `{ movimentacaoId, vendedorId, produtoId, categoriaId, valor, timestamp }`
- Classificar cada movimentação em exatamente um dos 4 tipos de regra: TAXA_FIXA, ESCALONADA, COM_TETO, BONUS_CATEGORIA
- TAXA_FIXA: aplicar percentual fixo definido no cadastro do vendedor sobre o valor da movimentação
- ESCALONADA: aplicar faixas de percentual progressivo (ex: 2% até R$10.000, 3% de R$10.001 a R$50.000, 4% acima de R$50.000)
- COM_TETO: aplicar percentual com valor máximo de comissão (ex: 5% limitado a R$500,00)
- BONUS_CATEGORIA: adicionar bônus fixo por unidade vendida quando a categoria do produto for elegível
- Processar movimentação duplicada (mesmo `movimentacaoId`) de forma idempotente — não recalcular nem duplicar registro
- Persistir na tabela `comissoes`: `(id, movimentacao_id, vendedor_id, tipo_regra, valor_comissao, calculado_em)`
- Emitir evento no tópico `comissoes.calculadas.v1` com schema: `{ comissaoId, movimentacaoId, vendedorId, tipoRegra, valorComissao, calculadoEm }`
- Evento inválido (schema incorreto, vendedor sem regra configurada) deve ser encaminhado para o tópico DLQ `movimentacoes.v1.dlq` com a causa do erro no header

### Fora de Escopo
- Pagamento das comissões calculadas
- Interface de usuário ou API REST de consulta
- Recálculo retroativo de movimentações já processadas
- Configuração das regras de comissão via API (regras são lidas de tabela pré-configurada)

---

## Especificação Não-Funcional

### Performance
P99 < 300ms por evento do consumo até a emissão do evento de saída. Capacidade de sustentar 1.000 eventos/minuto por partição Kafka sem degradação.

### Segurança
Nenhum dado pessoal (PII) nos logs. Payload do evento validado contra schema antes do processamento. Credenciais de banco e Kafka via variáveis de ambiente — sem hardcode.

### Escalabilidade
Escalonamento horizontal via consumer group Kafka: adicionar instâncias aumenta o throughput proporcionalmente ao número de partições do tópico (configurado com 10 partições).

### Usabilidade
N/A — serviço system-to-system sem interface humana direta.

### Disponibilidade
99,5% uptime. Falhas transitórias (banco indisponível, Kafka timeout) devem acionar retry com backoff exponencial (3 tentativas, backoff inicial 500ms) antes de enviar para DLQ.

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
PostgreSQL 15 (tabela `comissoes`; tabelas de configuração `regras_comissao` e `vendedores_regras` já existentes)

### Infraestrutura
Apache Kafka (AWS MSK), Docker, Kubernetes (EKS). CI/CD via GitHub Actions.

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
- Cobertura de testes ≥ 80% (unitários + integração)
- As 4 regras de cálculo validadas com casos numéricos explícitos nos testes
- Idempotência verificada: reprocessar o mesmo `movimentacaoId` não gera duplicata
- DLQ funcional: evento inválido encaminhado com causa no header
- Evento `comissoes.calculadas.v1` emitido e validado com schema correto
- Nenhum PII nos logs (verificado por teste ou inspeção de log em integração)
- Commit local na branch `feature/001-calculo-comissao-kafka`
```

### Como usar esta história

```
1. @speckit /new              → cria .speckit/STORY-001.md
2. Preencha o arquivo         → use o exemplo acima como referência
3. @speckit /validate         → valida o DoR
                                (se houver lacunas: agente pergunta e preenche)
                                (DoR atingido: gera .github/ + instrui próximo passo)
4. Copilot Chat → modo Agente → /implement
                                (agente apresenta o plano, aguarda confirmação,
                                 implementa + testa — portões 0–2)
5. @speckit /review           → instrui abrir nova sessão
6. Copilot Chat → modo Agente → /review
                                (revisão independente + entrega — portões 3–4)
```

> **Dica:** a história acima tem todos os campos preenchidos e o DoR completamente marcado — ao executar `@speckit /validate` o agente vai direto para o plano e confirmação, sem perguntas de alinhamento.

---

### História incompleta — exemplo do fluxo de alinhamento

Situação comum: o desenvolvedor preencheu o essencial após o kickoff mas deixou lacunas nos detalhes funcionais, nos requisitos não-funcionais e na arquitetura.

#### Arquivo: `.speckit/STORY-001.md` (incompleto)

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
O cálculo de comissões é feito em batch noturno e o time comercial não tem visibilidade em tempo real.

### Valor

### Stakeholders
- Time Comercial

---

## Especificação Funcional

### User Stories
- Como sistema, quero consumir eventos Kafka de movimentação e calcular a comissão

### Critérios de Aceite
- Consumir do tópico `movimentacoes.v1`
- Calcular comissão conforme regra do vendedor
- Persistir o resultado
- Emitir evento de saída

### Fora de Escopo
-

---

## Especificação Não-Funcional

### Performance

### Segurança

### Escalabilidade

### Usabilidade

### Disponibilidade

---

## Especificação Técnica

### Linguagem
java

### Framework
springboot

### Arquitetura

### Target
backend

### Banco de Dados
PostgreSQL

### Infraestrutura
Kafka, Kubernetes

---

## DoR — Definition of Ready

- [x] Requisito de negócio documentado e aprovado
- [ ] User stories com critérios de aceite mensuráveis
- [ ] Escopo delimitado (o que está e o que não está incluído)
- [ ] Requisitos não-funcionais definidos
- [x] Stack técnica decidida
- [ ] Padrão arquitetural definido
- [ ] DoD acordado com o time

---

## DoD — Definition of Done

- Todos os critérios de aceite validados
- Cobertura de testes ≥ 80%
```

#### O que acontece ao executar `@speckit /validate`

O agente detecta as lacunas e inicia o alinhamento conversacional, **uma pergunta por vez**:

```
Agente: Encontrei 6 lacunas na história. Vamos preenchê-las juntos.

        Primeira lacuna — [Requisito de Negócio] campo `valor`:
        Qual é o valor de negócio que esta feature entrega?
        O que muda para o time comercial ou para o financeiro
        quando o cálculo passar a ser em tempo real?

Usuário: Elimina o lag de D+1 no cálculo, permite dashboards ao vivo
         e antecipa o fechamento financeiro mensal.

Agente: ✓ Campo atualizado em .speckit/STORY-001.md

        Segunda lacuna — [Especificação Funcional] campo `critérios de aceite`:
        Os critérios atuais estão genéricos. A história menciona
        "regra do vendedor" — quais são os tipos de regra possíveis
        e como cada uma calcula a comissão?

Usuário: São 4 tipos: taxa fixa (percentual sobre o valor), escalonada
         (faixas de percentual), com teto (percentual com valor máximo)
         e bônus por categoria (valor fixo por categoria elegível).

Agente: ✓ Campo atualizado. Vou detalhar cada regra nos critérios.

        Terceira lacuna — [Especificação Funcional] campo `fora de escopo`:
        O que explicitamente NÃO deve ser implementado nesta história?
        Exemplos: pagamento das comissões, API de consulta, recálculo
        retroativo, configuração das regras?

Usuário: Pagamento, API REST, recálculo retroativo e configuração de regras.

Agente: ✓ Campo atualizado.

        Quarta lacuna — [Especificação Não-Funcional] campos de performance,
        segurança, escalabilidade e disponibilidade estão vazios.
        Começando pela performance: qual é o SLA esperado por evento?
        Existe um volume de pico definido?

... (continua até fechar todas as lacunas) ...

Agente: Todas as lacunas foram preenchidas.
        Execute @speckit /validate para gerar os arquivos de configuração,
        revisar o plano completo e iniciar a implementação.
```

Ao executar `/validate` novamente com a história completa:

```
✅ DoR atingido — história válida.
⏳ Gerando arquivos de configuração do Copilot...
✅ 19 arquivo(s) gerado(s): ...

▶ Próximo passo — iniciar a implementação:
1. Abra um novo Copilot Chat
2. Selecione o modo Agente
3. Digite /implement — o agente carregará o plano completo

O prompt está em .github/prompts/implement.prompt.md.
```

---

## Regras de teste e entrega

### Cobertura mínima obrigatória

Toda história requer **cobertura de código ≥ 80%** antes de ser considerada concluída. Esse critério é imposto em todos os arquivos baseline e nos prompts.

### Cenários obrigatórios

O prompt `implement.prompt.md` exige testes para cinco categorias:

| Categoria | Exemplos |
|---|---|
| **Happy path** | Fluxo principal conforme os critérios de aceite |
| **Edge cases** | null, vazio, zero, limite máximo/mínimo, lista com 1 elemento |
| **Error cases** | Not found, validação inválida, permissão negada, conflito |
| **Cenários da história** | Todos os cenários trazidos pelo usuário ao criar a história |
| **Cenários derivados** | Casos que emergem da implementação real — documentados com comentário |

### Portão de entrega

O agente só pode declarar uma história como **CONCLUÍDA** após passar pelo PORTÃO 4 do `review.prompt.md` (Sessão B), que valida sequencialmente:

1. **0 (zero) testes falhando** — evidência do relatório obrigatória
2. **Cobertura ≥ 80%** — relatório completo exibido no chat
3. **Todos os critérios do DoD atendidos** — checklist item a item
4. **Commit local** na branch `feature/<id>-<slug>` seguindo Conventional Commits: `feat(<story-id>): <descrição>`

---

## Fluxo git (Gitflow)

O arquivo `05-git-workflow.instructions.md` instrui o Copilot a seguir o gitflow padrão em toda implementação. O agente opera **apenas localmente** — não faz push nem abre PRs.

```
main        ←── hotfix/<slug>
  ↑
develop     ←── feature/<story-id>-<slug>   (commit local — sem push)
                release/<versão>
```

### Conventional Commits

Todos os commits devem seguir o formato:

```
<tipo>(<escopo>): <descrição curta em inglês>
```

| Tipo | Uso |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `test` | Adição ou correção de testes |
| `refactor` | Refatoração sem mudança de comportamento |
| `docs` | Documentação |
| `chore` | Build, dependências, configuração |

---

## Estrutura do projeto

```
vscode-plugin-speckit/
├── package.json
├── tsconfig.json
├── esbuild.js
├── .vscodeignore
├── .vscode/
│   ├── launch.json
│   └── tasks.json
└── src/
    ├── extension.ts
    ├── participant/
    │   ├── speckitParticipant.ts
    │   └── commands/
    │       ├── newCommand.ts
    │       ├── validateCommand.ts
    │       ├── applyCommand.ts
    │       ├── statusCommand.ts
    │       └── reviewCommand.ts
    ├── story/
    │   ├── Story.ts
    │   ├── StoryTemplate.ts
    │   ├── StoryParser.ts
    │   └── StoryValidator.ts
    └── generator/
        ├── CopilotConfigGenerator.ts
        ├── baseline/
        │   ├── AgentIntegrityGenerator.ts
        │   ├── PerformanceGenerator.ts
        │   ├── ArchitectureGenerator.ts
        │   ├── ContextManagementGenerator.ts
        │   ├── TestingStandardsGenerator.ts
        │   └── GitWorkflowGenerator.ts
        ├── language/
        │   ├── TypeScriptGenerator.ts
        │   ├── JavaScriptGenerator.ts
        │   ├── JavaGenerator.ts
        │   ├── CSharpGenerator.ts
        │   └── PythonGenerator.ts
        ├── framework/
        │   ├── DotNetGenerator.ts
        │   ├── SpringBootGenerator.ts
        │   ├── AngularGenerator.ts
        │   ├── ReactGenerator.ts
        │   └── FastApiGenerator.ts
        ├── story/
        │   ├── BusinessContextGenerator.ts
        │   ├── FunctionalSpecGenerator.ts
        │   ├── NonFunctionalGenerator.ts
        │   ├── TechStackGenerator.ts
        │   ├── ArchPatternGenerator.ts
        │   ├── DodGenerator.ts
        │   ├── IndexGenerator.ts
        │   └── PromptsGenerator.ts          # implement · write-tests · review · finalize · run (orquestrador) · gap-filling
        └── utils/
            ├── fileSystem.ts          # implementação VS Code (produção)
            ├── workspace.ts           # implementação VS Code (produção)
            ├── IFileSystem.ts         # interface (permite injeção em testes)
            ├── IWorkspace.ts          # interface (permite injeção em testes)
            ├── VscodeFileSystem.ts    # adapter: IFileSystem → fileSystem.ts
            └── VscodeWorkspace.ts     # adapter: IWorkspace → workspace.ts
tests/
├── __mocks__/
│   └── vscode.ts                      # mock manual do módulo vscode (vitest)
├── fixtures/
│   ├── story-complete.md
│   ├── story-empty.md
│   └── story-partial.md
├── unit/
│   ├── story/
│   │   ├── StoryParser.test.ts
│   │   ├── StoryValidator.test.ts
│   │   └── StoryTemplate.test.ts
│   ├── generator/
│   │   ├── CopilotConfigGenerator.test.ts
│   │   ├── baseline/generators.test.ts
│   │   ├── language/generators.test.ts
│   │   ├── framework/generators.test.ts
│   │   └── story/generators.test.ts
│   └── commands/
│       ├── newCommand.test.ts
│       ├── validateCommand.test.ts
│       ├── applyCommand.test.ts
│       ├── statusCommand.test.ts
│       └── reviewCommand.test.ts
└── integration/
    ├── runTests.ts                    # entrypoint @vscode/test-electron
    ├── suite/index.ts                 # runner mocha (dentro do VS Code host)
    ├── workspace/.gitkeep             # workspace mínimo para os testes
    └── tests/
        └── commands.integration.test.ts
```

---

## Dependências

Sem dependências de runtime. O plugin usa exclusivamente a VS Code API nativa.

### Build / produção

| Pacote | Versão | Uso |
|---|---|---|
| `@types/vscode` | `^1.93.0` | Tipos da API do VS Code |
| `typescript` | `^5.4.0` | Compilador |
| `esbuild` | `^0.21.0` | Bundler |

### Dev / testes

| Pacote | Versão | Uso |
|---|---|---|
| `vitest` | `^2.0.0` | Unit test runner |
| `@vitest/coverage-v8` | `^2.0.0` | Relatório de cobertura |
| `@vscode/test-electron` | `^2.4.0` | Integration test runner (VS Code headless) |
| `mocha` | `^10.0.0` | Test runner dentro do host VS Code |
| `@types/mocha` | `^10.0.0` | Tipos do mocha |
| `@types/node` | `^20.0.0` | Tipos do Node.js |
| `glob` | `^10.0.0` | Glob para descoberta de arquivos de teste |
