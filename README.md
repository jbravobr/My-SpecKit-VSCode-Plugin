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

## Exemplo prático — História

### História completa

Representa uma feature real com todos os campos obrigatórios preenchidos e DoR marcado. Ao executar `@speckit /validate` o agente vai direto para a geração dos arquivos, sem perguntas de alinhamento.

**Contexto:** serviço backend que consome eventos de movimentação de vendas via Kafka, classifica cada movimentação em um dos 4 tipos de regra de comissão, calcula o valor, persiste e emite um evento de resultado.

#### Arquivo: `.speckit/STORY-001.md`

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
- Como sistema, ao receber um evento de movimentação no tópico Kafka `movimentacoes.v1`, quero classificá-la
  em um dos 4 tipos de regra e calcular a comissão correspondente
- Como sistema, quero persistir a comissão calculada no banco de dados para que o histórico seja auditável
- Como sistema, quero emitir um evento `comissoes.calculadas.v1` após o cálculo para notificar consumidores downstream

### Critérios de Aceite
- Consumir eventos do tópico Kafka `movimentacoes.v1` com schema:
  `{ movimentacaoId, vendedorId, produtoId, categoriaId, valor, timestamp }`
- Classificar cada movimentação em exatamente um dos 4 tipos de regra:
  TAXA_FIXA, ESCALONADA, COM_TETO, BONUS_CATEGORIA
- TAXA_FIXA: aplicar percentual fixo definido no cadastro do vendedor sobre o valor da movimentação
- ESCALONADA: aplicar faixas de percentual progressivo (ex: 2% até R$10.000, 3% de R$10.001–R$50.000, 4% acima)
- COM_TETO: aplicar percentual com valor máximo de comissão (ex: 5% limitado a R$500,00)
- BONUS_CATEGORIA: adicionar bônus fixo por unidade vendida quando a categoria do produto for elegível
- Processar movimentação duplicada (mesmo `movimentacaoId`) de forma idempotente
- Persistir na tabela `comissoes`: `(id, movimentacao_id, vendedor_id, tipo_regra, valor_comissao, calculado_em)`
- Emitir evento no tópico `comissoes.calculadas.v1` com schema:
  `{ comissaoId, movimentacaoId, vendedorId, tipoRegra, valorComissao, calculadoEm }`
- Evento inválido → encaminhar para DLQ `movimentacoes.v1.dlq` com causa do erro no header

### Fora de Escopo
- Pagamento das comissões calculadas
- Interface de usuário ou API REST de consulta
- Recálculo retroativo de movimentações já processadas
- Configuração das regras de comissão via API

---

## Especificação Não-Funcional

### Performance
P99 < 300ms por evento. Capacidade de 1.000 eventos/minuto por partição Kafka sem degradação.

### Segurança
Nenhum PII nos logs. Payload validado contra schema antes do processamento.
Credenciais via variáveis de ambiente — sem hardcode.

### Escalabilidade
Escalonamento horizontal via consumer group Kafka: 10 partições configuradas.

### Usabilidade
N/A — serviço system-to-system.

### Disponibilidade
99,5% uptime. Retry com backoff exponencial (3 tentativas, backoff inicial 500ms) antes de DLQ.

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
PostgreSQL 15 (tabela `comissoes`; tabelas `regras_comissao` e `vendedores_regras` já existentes)

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
- Nenhum PII nos logs
- Commit local na branch `feature/001-calculo-comissao-kafka`
```

#### Como usar esta história

```
1. @speckit /new              → cria .speckit/STORY-001.md
2. Preencha o arquivo         → use o exemplo acima como referência
3. @speckit /validate         → DoR atingido: gera .github/ + instrui próximo passo
4. Copilot Chat → modo Agente → /implement
5. @speckit /review           → instrui abrir nova sessão
6. Copilot Chat → modo Agente → /review
```

---

### História incompleta — fluxo de alinhamento

Situação comum: o desenvolvedor preencheu o essencial mas deixou lacunas nos detalhes funcionais, nos requisitos não-funcionais e na arquitetura.

#### Arquivo: `.speckit/STORY-001.md` (incompleto)

```markdown
# História 001

<!-- metadata
id: 001
title: Cálculo de comissão a partir de eventos Kafka de movimentação
createdAt: 2026-03-19
version: 1
-->

## Requisito de Negócio

### Problema
O cálculo de comissões é feito em batch noturno e o time comercial não tem visibilidade em tempo real.

### Valor

### Stakeholders
- Time Comercial

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

## Especificação Não-Funcional

### Performance
### Segurança
### Escalabilidade
### Usabilidade
### Disponibilidade

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

## DoR — Definition of Ready

- [x] Requisito de negócio documentado e aprovado
- [ ] User stories com critérios de aceite mensuráveis
- [ ] Escopo delimitado (o que está e o que não está incluído)
- [ ] Requisitos não-funcionais definidos
- [x] Stack técnica decidida
- [ ] Padrão arquitetural definido
- [ ] DoD acordado com o time

## DoD — Definition of Done

- Todos os critérios de aceite validados
- Cobertura de testes ≥ 80%
```

#### O que acontece ao executar `@speckit /validate`

O agente detecta as lacunas e conduz o alinhamento **uma pergunta por vez**.

> **🤖 Agente**
>
> Encontrei 6 lacunas na história. Vamos preenchê-las juntos, uma por vez.
>
> **Lacuna 1 — [Requisito de Negócio] campo `valor`:**
> Qual é o valor de negócio que esta feature entrega?
> O que muda para o time comercial ou para o financeiro quando o cálculo passar a ser em tempo real?

**👤 Você** — Elimina o lag de D+1 no cálculo, permite dashboards ao vivo e antecipa o fechamento financeiro mensal.

> **🤖 Agente**
>
> ✓ Campo `valor` atualizado em `.speckit/STORY-001.md`
>
> **Lacuna 2 — [Especificação Funcional] critérios de aceite muito genéricos:**
> A história menciona "regra do vendedor" — quais são os tipos de regra possíveis e como cada uma calcula a comissão?

**👤 Você** — São 4 tipos: taxa fixa (percentual sobre o valor), escalonada (faixas de percentual), com teto (percentual com valor máximo) e bônus por categoria (valor fixo por categoria elegível).

> **🤖 Agente**
>
> ✓ Critérios de aceite detalhados para as 4 regras.
>
> **Lacuna 3 — [Especificação Funcional] campo `fora de escopo` vazio:**
> O que explicitamente NÃO deve ser implementado? Ex: pagamento das comissões, API de consulta, recálculo retroativo, configuração de regras?

**👤 Você** — Pagamento, API REST, recálculo retroativo e configuração de regras.

> **🤖 Agente**
>
> ✓ Fora de escopo atualizado.
>
> **Lacuna 4 — [Especificação Não-Funcional] performance:**
> Qual o SLA esperado por evento (latência P99)? Existe um volume de pico definido em eventos/minuto?

**👤 Você** — P99 < 300ms, capacidade de 1.000 eventos/minuto por partição.

> **🤖 Agente**
>
> ✓ Performance atualizada.
>
> **Lacuna 5 — [Especificação Técnica] arquitetura não preenchida:**
> Qual o padrão arquitetural do serviço? (hexagonal · layered · microservices · monolith · serverless)

**👤 Você** — Hexagonal.

> **🤖 Agente**
>
> ✓ Arquitetura definida como `hexagonal`.
>
> **Lacuna 6 — DoD incompleto:**
> Além de critérios de aceite e cobertura ≥ 80%, quais outros critérios de conclusão devem ser exigidos? Ex: idempotência, DLQ funcional, sem PII nos logs, commit na branch?

**👤 Você** — Idempotência verificada, DLQ funcional com causa no header, sem PII nos logs, commit na branch `feature/001-calculo-comissao-kafka`.

> **🤖 Agente**
>
> ✓ DoD atualizado. Todas as lacunas foram preenchidas.
>
> Execute `@speckit /validate` novamente para gerar os arquivos de configuração e iniciar a implementação.

Ao executar `/validate` com a história completa:

> **🤖 Agente**
>
> ✅ DoR atingido — história válida.
> ⏳ Gerando arquivos de configuração do Copilot...
> ✅ 19 arquivo(s) gerado(s) em `.github/`
>
> **▶ Próximo passo — iniciar a implementação:**
> 1. Abra um novo Copilot Chat
> 2. Selecione o modo **Agente**
> 3. Digite `/implement` — o agente carregará o plano completo
>
> O prompt está em `.github/prompts/implement.prompt.md`.

---

## Exemplo prático — Fix

### Fix completo

Representa um bug real com todos os campos obrigatórios preenchidos. Ao executar `@speckit /validate` o agente detecta a stack automaticamente, gera os arquivos e instrui a abrir `/fix-implement`.

#### Arquivo: `.speckit/FIX-001.md`

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
A rota `/api/auth/callback` retorna HTTP 500 ao invés de 401 quando o token OAuth2 está expirado.
O cliente recebe uma página de erro genérica e é deslogado abruptamente, sem mensagem adequada.

### Passos para Reproduzir
1. Autenticar via GitHub OAuth2
2. Aguardar o token expirar (1 hora)
3. Tentar realizar qualquer requisição autenticada

### Ambiente Afetado
Production — Node.js 20, Express 4.18, Ubuntu 22.04

### Frequência de Ocorrência
Sempre — 100% reproduzível após expiração do token.

---

## Root Cause Hypothesis

### Hipótese
O middleware de autenticação não trata a exceção `TokenExpiredError` lançada pela biblioteca JWT.
O erro propaga sem handler e o Express retorna 500 genérico ao invés de 401.

### Arquivos/Componentes Suspeitos
- `src/middleware/auth.ts` — tratamento de erros JWT
- `src/routes/auth.ts` — callback OAuth2

---

## Impact Assessment

### Severidade
high

### Usuários/Sistemas Afetados
Todos os usuários autenticados com sessões longas (> 1h). Estimativa: 60% dos usuários ativos por dia.

### Risco de Regressão
Mudanças no middleware de autenticação podem impactar outros fluxos: refresh de token,
autenticação via API key e rotas públicas com autenticação opcional.

---

## Regression Prevention

### Testes a Adicionar
- Teste unitário: middleware retorna 401 quando `TokenExpiredError` é lançado
- Teste unitário: middleware retorna 401 para token com assinatura inválida (`JsonWebTokenError`)
- Teste de integração: `GET /api/me` com token expirado retorna `{ error: "token_expired" }` e status 401
- Teste de integração: `GET /api/me` com token válido continua funcionando (regressão)

---

## DoF — Definition of Fixed

- [ ] Bug não reproduz mais com os passos documentados
- [ ] Root cause endereçado (não apenas patched)
- [ ] Testes de regressão adicionados e passando
- [ ] Cobertura ≥ 80%
- [ ] Commit local na branch `fix/001-oauth2-token-expired-500`
```

#### Como usar este fix

```
1. @speckit /fix              → cria .speckit/FIX-001.md
2. Preencha o arquivo         → use o exemplo acima como referência
   (a stack técnica é detectada automaticamente do workspace)
3. @speckit /validate         → Fix válido: gera .github/ + instrui próximo passo
4. Copilot Chat → modo Agente → /fix-implement
5. @speckit /review           → instrui abrir nova sessão
6. Copilot Chat → modo Agente → /fix-review
```

---

### Fix incompleto — fluxo de alinhamento

Situação comum: o desenvolvedor preencheu o bug e o ambiente mas não tem hipótese clara nem testes de regressão definidos.

#### Arquivo: `.speckit/FIX-002.md` (incompleto)

```markdown
# Fix 002

<!-- metadata
id: 002
title: Botão exportar PDF não responde no Firefox
createdAt: 2026-03-20
version: 1
type: fix
status: open
-->

## Bug Description

### Título do Bug
Botão exportar PDF não responde no Firefox

### Sintomas
Ao clicar no botão de exportar PDF, nada acontece no Firefox 121.

### Passos para Reproduzir
-

### Ambiente Afetado
Firefox 121, Windows 11

### Frequência de Ocorrência
Sempre no Firefox

---

## Root Cause Hypothesis

### Hipótese

### Arquivos/Componentes Suspeitos
- src/components/ExportButton.tsx

---

## Impact Assessment

### Severidade
<!-- TODO: critical | high | medium | low -->

### Usuários/Sistemas Afetados
Usuários do Firefox (~30% da base)

### Risco de Regressão
Mudanças no componente ExportButton

---

## Regression Prevention

### Testes a Adicionar
-

---

## DoF — Definition of Fixed

- [ ] Bug não reproduz mais com os passos documentados
- [ ] Root cause endereçado (não apenas patched)
- [ ] Testes de regressão adicionados e passando
- [ ] Cobertura ≥ 80%
- [ ] Commit local na branch `fix/002-<slug>`
```

#### O que acontece ao executar `@speckit /validate`

O agente detecta as lacunas e conduz o alinhamento **uma pergunta por vez**.

> **🤖 Agente**
>
> Encontrei 4 lacunas no fix. Vamos preenchê-las juntos.
>
> **Lacuna 1 — [Bug Description] passos para reproduzir vazios:**
> Quais são os passos exatos para reproduzir o problema no Firefox?
> Existe alguma mensagem de erro no console do navegador?

**👤 Você** — Acessar o relatório de vendas, clicar em "Exportar PDF". No console do Firefox aparece: `TypeError: window.print is not a function`.

> **🤖 Agente**
>
> ✓ Passos e evidência de console registrados.
>
> **Lacuna 2 — [Root Cause Hypothesis] hipótese vazia:**
> Com base no erro `window.print is not a function`, qual é sua hipótese da causa raiz?
> O componente usa `window.print()` diretamente ou via alguma biblioteca?

**👤 Você** — O componente usa `window.print()` diretamente. A hipótese é que o Firefox bloqueia `window.print()` quando chamado dentro de um handler de evento `onClick` assíncrono — o Firefox exige que o `window.print()` seja chamado diretamente no handler síncrono.

> **🤖 Agente**
>
> ✓ Hipótese registrada com rastreamento ao `ExportButton.tsx`.
>
> **Lacuna 3 — [Impact Assessment] severidade não preenchida:**
> Qual a severidade deste bug? (critical · high · medium · low)
> Considere: o Firefox representa ~30% da base e a exportação é uma funcionalidade core?

**👤 Você** — High — exportação é usada diariamente pelo time financeiro.

> **🤖 Agente**
>
> ✓ Severidade definida como `high`.
>
> **Lacuna 4 — [Regression Prevention] testes não definidos:**
> Quais testes de regressão devem ser adicionados para garantir que o bug não volte?
> Dica: considere testar o comportamento do botão em diferentes contextos (handler síncrono x assíncrono).

**👤 Você** — Teste unitário que verifica se `window.print()` é chamado de forma síncrona. Teste de integração que simula o clique no botão e verifica a chamada.

> **🤖 Agente**
>
> ✓ Testes de regressão definidos. Todas as lacunas foram preenchidas.
>
> Execute `@speckit /validate` novamente para gerar os arquivos de configuração e iniciar a correção.

Ao executar `/validate` com o fix completo:

> **🤖 Agente**
>
> ✅ Fix válido — todos os campos obrigatórios preenchidos.
> 🔍 Detectando stack do workspace... TypeScript + React encontrados.
> ⏳ Gerando arquivos de configuração do Copilot...
> ✅ 14 arquivo(s) gerado(s) em `.github/`
>
> **▶ Próximo passo — iniciar a investigação e correção:**
> 1. Abra um novo Copilot Chat
> 2. Selecione o modo **Agente**
> 3. Digite `/fix-implement` — o agente investigará a root cause, aplicará o fix e adicionará testes de regressão
>
> O prompt está em `.github/prompts/fix-implement.prompt.md`.

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
