# Workflow Sprint SSD — Spec Driven Development com SpecKit

> Documento de processo para times de até 10 devs (backend + frontend) que utilizam feature branches e querem maximizar paralelismo e qualidade na sprint usando o plugin SpecKit.

---

## Sumário

1. [Visão Geral do Modelo](#visão-geral-do-modelo)
2. [Cerimônia de Refinamento SSD](#cerimônia-de-refinamento-ssd)
3. [Workflow da Sprint — Passo a Passo](#workflow-da-sprint--passo-a-passo)
4. [Modelo de Paralelismo](#modelo-de-paralelismo)
5. [Detecção e Correção de Má Quebra](#detecção-e-correção-de-má-quebra)
6. [Diagrama de Fluxo](#diagrama-de-fluxo)
7. [FAQ e Troubleshooting](#faq-e-troubleshooting)

---

## Visão Geral do Modelo

O **SSD (Spec Driven Development)** com SpecKit transforma o refinamento de sprint num processo estruturado onde:

1. Cada estória do Kanban é **decomposta em specs atômicas** (1 spec = 1 feature branch = 1 dev)
2. Dependências entre specs são **declaradas explicitamente** via `depends-on` no metadata
3. O plugin gera **agentes Copilot individualizados** para cada spec, permitindo N devs trabalharem em paralelo com contexto completo
4. A análise de dependências do `/batch --unified` mostra **quem pode começar agora** e **quem está bloqueado**

### Benefícios para o time

| Problema Atual | Solução SSD |
|---|---|
| Estória grande demais para 1 sprint | Decomposição via `/draft` → specs atômicas com DoR verificável |
| Deps ocultas descobertas no meio da sprint | `depends-on` declarado no refinamento, bloqueio visível no `/batch` |
| Dev ocioso esperando PR de outro | Stories independentes identificadas; dev pega próxima livre |
| Backend bloqueia frontend (ou vice-versa) | Deps cross-squad explícitas; contrato definido na spec antes de codificar |
| Contexto perdido entre devs | Cada spec carrega requisito, NFRs, stack, arquitetura — o agente "sabe tudo" |

---

## Cerimônia de Refinamento SSD

### Quando: antes ou no início da sprint

### Quem: todo o time (backend + frontend + PO/Tech Lead)

### Duração sugerida: 1h-1h30 (para 5-10 estórias)

### Fluxo da Cerimônia

```
  ┌─────────────────────────────────────────────────────────────┐
  │  1. PO apresenta estória do Kanban (texto informal)         │
  │                         │                                   │
  │                         ▼                                   │
  │  2. Tech Lead roda:  @speckit /draft <descrição>            │
  │     (compartilha tela ou projeta)                           │
  │                         │                                   │
  │                         ▼                                   │
  │  3. Time responde entrevista (6 fases) coletivamente        │
  │     - Backend foca em NFRs, arquitetura, banco              │
  │     - Frontend foca em UX, critérios de aceite visuais      │
  │     - PO valida valor de negócio e escopo                   │
  │                         │                                   │
  │                         ▼                                   │
  │  4. Spec STORY-XXX.md gerada → time avalia:                 │
  │     - É atômica? (1 dev consegue entregar em ≤3 dias?)      │
  │     - Tem dependência de outra spec?                        │
  │     - Precisa split backend/frontend?                       │
  │                         │                                   │
  │                         ▼                                   │
  │  5. Se não atômica → SPLIT:                                 │
  │     @speckit /draft <parte-backend>                         │
  │     @speckit /draft <parte-frontend>                        │
  │     Declarar depends-on entre as partes                     │
  │                         │                                   │
  │                         ▼                                   │
  │  6. @speckit /validate em cada spec                         │
  │     → DoR atingido? Se não, gap-fill coletivo              │
  │                         │                                   │
  │                         ▼                                   │
  │  7. @speckit /batch --unified                               │
  │     → Mapa de dependências + stories independentes          │
  │     → Distribuição de trabalho                              │
  └─────────────────────────────────────────────────────────────┘
```

### Regras da Cerimônia

1. **Uma spec por vez** — não avance para a próxima estória sem validar a anterior
2. **Atomicidade obrigatória** — se leva mais de 3 dias ou exige 2+ devs, precisa split
3. **Deps explícitas no ato** — se durante a entrevista alguém disser "isso depende de X", declara imediatamente no `depends-on`
4. **Contrato antes de código** — specs de backend que expõem API para frontend devem declarar o contrato (endpoint, payload) nos critérios de aceite antes da sprint começar
5. **PO valida escopo** — "fora de escopo" preenchido garante que ninguém expande a spec durante a implementação

### Exemplo: Decomposição de Estória Grande

**Estória original no Kanban:**
> "Como gerente, quero ver um dashboard de comissões em tempo real"

**Decomposição no refinamento:**

| Spec | Tipo | Squad | depends-on | Dev |
|------|------|-------|------------|-----|
| `STORY-001` | Cálculo de comissão (evento Kafka) | Backend | — | Dev A |
| `STORY-002` | API REST de consulta de comissões | Backend | `STORY-001` | Dev B |
| `STORY-003` | Componente Dashboard (frontend) | Frontend | `STORY-002` | Dev C |
| `STORY-004` | Integração real-time (WebSocket) | Backend | `STORY-001` | Dev D |
| `STORY-005` | Widget de notificação (frontend) | Frontend | `STORY-004` | Dev E |

**Resultado do `/batch --unified`:**
```
### ✅ Stories independentes (prontas para execução)
- STORY-001

### ⚠️ Dependências pendentes
- STORY-002 bloqueada por: STORY-001
- STORY-003 bloqueada por: STORY-002
- STORY-004 bloqueada por: STORY-001
- STORY-005 bloqueada por: STORY-004
```

**Implicação prática:** No dia 1, apenas Dev A pode começar em STORY-001. Para evitar ociosidade, o time deve ter **mais specs independentes** na sprint (vindas de outras estórias do Kanban) ou reorganizar a decomposição para maximizar independência.

---

## Workflow da Sprint — Passo a Passo

### Fase 1: Início da Sprint (Dia 1)

```bash
# Tech Lead/Scrum Master executa no workspace do projeto:
@speckit /batch --unified
```

O output mostra:
- ✅ Stories **independentes** → podem começar imediatamente
- ⚠️ Stories **bloqueadas** → aguardam dependências
- Cada dev abre o agente da sua story no dropdown do Copilot Chat

### Fase 2: Dev Pega Story

```
1. Dev cria feature branch:
   git checkout -b feature/STORY-001-calculo-comissao

2. Abre o Copilot Chat e seleciona o agente:
   speckit-story-001 (dropdown)

3. O agente já conhece:
   - Requisito de negócio
   - Critérios de aceite
   - NFRs (P99, segurança)
   - Stack técnica
   - Arquitetura
   - Dependências

4. Dev implementa guiado pelos Gates:
   Gate 0 (Alinhamento) → Gate 1 (Implementação) → Gate 2 (Testes)
```

### Fase 3: Revisão e Entrega

```
1. Ao concluir Gate 2, o agente unificado faz handoff:
   IMPLEMENTADOR → REVISOR (Gate 3)

2. Revisor executa checklist de qualidade automaticamente

3. Se aprovado → Gate 4 (Entrega)
   Se alterações solicitadas → volta Gate 2

4. Dev faz PR da feature branch → main/develop

5. Quando STORY-001 muda para status "done":
   → /batch --unified recalcula dependências
   → STORY-002 e STORY-004 ficam independentes
   → Devs B e D podem começar
```

### Fase 4: Cascata de Desbloqueio

À medida que specs são concluídas:

```
Dia 1:  ████░░░░░░  STORY-001 (Dev A)
Dia 2:  ████████░░  STORY-001 concluída → desbloqueia 002 + 004
Dia 3:  ░░████░░░░  STORY-002 (Dev B) + STORY-004 (Dev D) em paralelo
Dia 4:  ░░████████  002 concluída → desbloqueia 003
Dia 5:  ░░░░░░████  STORY-003 (Dev C) + STORY-005 (Dev E)
```

### Protocolo Diário (Daily Standup com SpecKit)

```bash
# Qualquer dev pode verificar estado atual:
@speckit /status

# Output mostra gate atual de cada story + bloqueios
```

Perguntas que a daily responde com SpecKit:
- "Quem está bloqueado?" → `/batch` mostra deps pendentes
- "Que posso pegar?" → stories independentes sem dono
- "Qual o progresso?" → `/status` mostra gate de cada spec

---

## Modelo de Paralelismo

### Baseline: 1 Dev = 1 Feature Branch = 1 Story

```
Dev A:  git checkout -b feature/STORY-001  →  agente speckit-story-001
Dev B:  git checkout -b feature/STORY-002  →  agente speckit-story-002
Dev C:  git checkout -b feature/STORY-003  →  agente speckit-story-003
...
```

Cada dev trabalha isolado na sua branch com o agente específico da sua story. O agente tem todo o contexto necessário — não precisa consultar outro dev para entender o requisito.

### Avançado: Git Worktree (para devs que pegam múltiplas stories)

> **O que é:** `git worktree` permite ter múltiplos checkouts do mesmo repositório em diretórios separados, sem clonar novamente. Cada worktree tem sua própria branch e working directory.

**Cenário:** Dev A terminou STORY-001 e quer começar STORY-004 sem abandonar o PR aberto da 001:

```bash
# No diretório raiz do projeto:
git worktree add ../projeto-story-004 -b feature/STORY-004

# Agora o dev tem dois diretórios:
# ./projeto/              → branch feature/STORY-001 (PR aberto, pode fazer fixes)
# ./projeto-story-004/   → branch feature/STORY-004 (novo trabalho)
```

**Vantagens do worktree:**
- Sem `git stash` / `git checkout` → zero risco de perder trabalho
- Pode rodar testes na story-001 enquanto implementa story-004
- Cada VS Code window abre um worktree → agente Copilot específico por janela

**Quando usar:**
- Dev sênior que pega 2+ stories na sprint
- Story concluída aguardando review (dev não fica ocioso)
- Hotfix urgente sem perder contexto do trabalho atual

**Quando NÃO usar:**
- Repos muito grandes (cada worktree ocupa espaço)
- Dev júnior que se confundiria com múltiplos diretórios
- Se o time prefere 1 story por vez por disciplina

### Governança de Branch com SpecKit

O `/batch --unified` suporta `--branch-strategy` para resolver conflitos:

```bash
# Usa branch da sessão atual do VS Code:
@speckit /batch --generate --unified --branch-strategy session

# Respeita branches citadas nas specs:
@speckit /batch --generate --unified --branch-strategy cited
```

---

## Detecção e Correção de Má Quebra

### Problema 1: Estória Grande Demais

**Sintomas:**
- Spec com mais de 5 critérios de aceite
- Estimativa > 3 dias para 1 dev
- Envolve backend + frontend + infra na mesma spec
- DoR não é atingido facilmente (muitas lacunas no `/validate`)

**Técnica de Detecção no Refinamento:**

Após rodar `/draft` e gerar a spec, aplique o **teste dos 3 dias**:

> "Um dev sozinho, com o agente Copilot, consegue entregar isso em ≤ 3 dias com testes?"

Se a resposta for "não" → **SPLIT obrigatório**.

**Padrões de Split:**

| Sinal | Split Recomendado |
|-------|-------------------|
| Backend + Frontend na mesma spec | Split por squad: `STORY-X-api` + `STORY-X-ui` |
| CRUD + Regra de Negócio complexa | Split: `STORY-X-domain` (regra) + `STORY-X-infra` (persistência/API) |
| Múltiplos consumers/producers | 1 spec por consumer/producer |
| Dashboard com N widgets | 1 spec por widget (se independentes) |
| Migração + feature nova | `STORY-X-migration` + `STORY-X-feature` (com depends-on) |

### Problema 2: Dependências Ocultas

**Sintomas:**
- Dev descobre no meio da sprint que precisa de algo que outro dev está fazendo
- PR fica bloqueado esperando merge de outro PR
- "Eu achei que isso já existia" → não existia

**Técnica de Detecção no Refinamento:**

Para cada spec gerada, pergunte explicitamente:

1. **"Essa spec consome alguma API/contrato/evento que não existe ainda?"**
   - Se sim → qual spec vai criar? → declarar `depends-on`

2. **"Essa spec cria algo que outra spec vai consumir?"**
   - Se sim → a outra spec deve declarar `depends-on: <esta>`

3. **"Essa spec modifica algo que outra spec também modifica?"**
   - Se sim → não pode ser paralela — serializar via `depends-on`

**Checklist de Deps Cross-Squad:**

| Frontend precisa de... | Backend deve ter spec para... |
|---|---|
| Endpoint GET /comissoes | API REST de consulta (spec dedicada) |
| WebSocket /ws/notifications | Serviço de push (spec dedicada) |
| Contrato de response | Schema definido nos critérios de aceite da spec backend |

**Regra de ouro:** Se o frontend precisa de um endpoint, o endpoint deve existir como spec separada (ou já estar em produção). Nunca assuma que "o backend faz junto".

### Técnica: Matriz de Dependências Visual

Após gerar todas as specs da sprint, construa a matriz:

```
         001  002  003  004  005
STORY-001  —    ←    .    ←    .
STORY-002  →    —    ←    .    .
STORY-003  .    →    —    .    .
STORY-004  →    .    .    —    ←
STORY-005  .    .    .    →    —

→ = "eu dependo de"
← = "dependem de mim"
.  = independente
```

O `/batch --unified` já gera essa análise automaticamente. Se o grafo resultante for **linear** (001→002→003→004→005), o time tem um problema: **serialização total** = 1 dev por vez. Reorganize para maximizar specs independentes.

### Meta: Índice de Paralelismo

```
Índice = (stories independentes no dia 1) / (total de devs)

Ideal:  ≥ 0.7 (70% dos devs podem começar no dia 1)
Aceitável: ≥ 0.5
Ruim: < 0.3 (maioria bloqueada)
```

Se o índice é ruim → voltar ao refinamento e redecompor.

---

## Diagrama de Fluxo

```
╔══════════════════════════════════════════════════════════════════════╗
║                    CICLO SPRINT SSD COM SPECKIT                      ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ┌──────────────────────────────────────────────────────────────┐   ║
║  │              REFINAMENTO (pré-sprint ou dia 1)                │   ║
║  │                                                              │   ║
║  │  Kanban Stories ──→ /draft (coletivo) ──→ STORY-XXX.md       │   ║
║  │       │                                        │             │   ║
║  │       │            Teste 3 dias?               │             │   ║
║  │       │          /        \                    │             │   ║
║  │       │        Sim         Não → SPLIT         │             │   ║
║  │       │         │              │               │             │   ║
║  │       │         ▼              ▼               │             │   ║
║  │       │    /validate    /draft (parte A/B)     │             │   ║
║  │       │         │              │               │             │   ║
║  │       │         ▼              ▼               │             │   ║
║  │       │    depends-on ←── Deps explícitas      │             │   ║
║  │       │         │                              │             │   ║
║  │       │         ▼                              │             │   ║
║  │       └── /batch --unified ────────────────────┘             │   ║
║  │                    │                                         │   ║
║  │         ┌──────────┴──────────┐                              │   ║
║  │         │                     │                              │   ║
║  │    Independentes         Bloqueadas                          │   ║
║  │    (prontas)             (aguardam)                          │   ║
║  └──────────────────────────────────────────────────────────────┘   ║
║                    │                                                  ║
║                    ▼                                                  ║
║  ┌──────────────────────────────────────────────────────────────┐   ║
║  │                    EXECUÇÃO (sprint)                           │   ║
║  │                                                              │   ║
║  │  Dev A ─→ feature/STORY-001 ─→ agente speckit-story-001     │   ║
║  │  Dev B ─→ feature/STORY-006 ─→ agente speckit-story-006     │   ║
║  │  Dev C ─→ feature/STORY-007 ─→ agente speckit-story-007     │   ║
║  │  ...                                                         │   ║
║  │                                                              │   ║
║  │  Cada dev segue: Gate 0 → Gate 1 → Gate 2 → Gate 3 → Gate 4│   ║
║  │                                                              │   ║
║  │  Ao concluir (status: done):                                 │   ║
║  │    → /batch --unified recalcula deps                         │   ║
║  │    → Stories desbloqueadas ficam disponíveis                  │   ║
║  │    → Dev ocioso pega próxima independente                    │   ║
║  └──────────────────────────────────────────────────────────────┘   ║
║                    │                                                  ║
║                    ▼                                                  ║
║  ┌──────────────────────────────────────────────────────────────┐   ║
║  │                    DAILY (standup)                             │   ║
║  │                                                              │   ║
║  │  @speckit /status → gate atual de cada dev                   │   ║
║  │  @speckit /batch  → quem está bloqueado / quem pode pegar    │   ║
║  │                                                              │   ║
║  │  Decisões:                                                   │   ║
║  │  - Dev bloqueado → pega story independente de outro épico    │   ║
║  │  - Dev terminou → pega próxima desbloqueada                  │   ║
║  │  - Dep descoberta tarde → declara depends-on + recalcula     │   ║
║  └──────────────────────────────────────────────────────────────┘   ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## FAQ e Troubleshooting

### "E se uma story bloqueante atrasa?"

1. Identifique quais stories estão bloqueadas por ela (`/batch` mostra)
2. Redirecione devs bloqueados para stories independentes de outro épico
3. Se não há stories independentes → pair programming na bloqueante para acelerar
4. Em último caso → dividir a bloqueante em partes menores (re-split mid-sprint)

### "Como o frontend começa se o backend ainda não entregou a API?"

**Contract-first approach:**
1. Na spec do backend, os critérios de aceite definem o contrato (endpoint, request/response schema)
2. O frontend usa esse contrato para mock local desde o dia 1
3. A dependência (`depends-on`) existe para o merge final, não para o início do trabalho
4. Frontend desenvolve contra mock → integra quando backend merga

### "Dev terminou sua story e não tem mais nada. O que faz?"

Ordem de prioridade:
1. Pegar próxima story independente (verificar `/batch`)
2. Fazer code review de PRs de colegas
3. Pair programming em story bloqueante (para desbloqueá-la mais rápido)
4. Tech debt / refactoring (criar spec via `/draft --refactoring`)

### "Descobrimos uma dep no meio da sprint que não foi mapeada"

1. Adicione `depends-on: <ID>` no metadata da spec afetada
2. Rode `@speckit /batch --unified` novamente para recalcular
3. Na daily, comunique o bloqueio e redistribua

### "O time é pequeno (3-4 devs). Vale a pena todo esse processo?"

Sim, com adaptações:
- Refinamento mais curto (30min)
- Menos splits (aceitar stories de 5 dias se há poucos devs)
- O valor principal é a **clareza de contexto** que o agente dá — mesmo 1 dev sozinho se beneficia do SDD

### "Posso usar worktree com SpecKit?"

Sim. Cada worktree é um diretório independente com sua branch. Abra cada worktree numa janela VS Code separada → o agente Copilot será o da story daquela branch. Não há conflito com o SpecKit.

```bash
# Criar worktree para segunda story:
git worktree add ../meu-projeto-story-002 -b feature/STORY-002

# Abrir no VS Code:
code ../meu-projeto-story-002

# Nessa janela, selecionar agente speckit-story-002 no dropdown
```

### "Como funciona quando backend e frontend estão em repos diferentes?"

Cada repo tem seu próprio `.speckit/` e seus próprios agentes. A dependência cross-repo é gerenciada por **contrato**:
1. Spec do backend define o contrato no critério de aceite
2. Spec do frontend referencia o contrato (pode copiar o schema)
3. `depends-on` cross-repo não é suportado automaticamente — use comunicação explícita na daily

---

## Resumo: Checklist do Tech Lead

### Antes da Sprint
- [ ] Rodar `/draft` para cada estória do Kanban (coletivamente)
- [ ] Aplicar teste dos 3 dias em cada spec
- [ ] Splits feitos onde necessário
- [ ] `depends-on` declarado para todas as deps conhecidas
- [ ] `/validate` passou em todas as specs
- [ ] `/batch --unified` mostra índice de paralelismo ≥ 0.5
- [ ] Stories distribuídas (1 spec independente por dev no dia 1)

### Durante a Sprint
- [ ] Daily usa `/status` para visibilidade
- [ ] Devs que terminam pegam próxima story independente
- [ ] Deps descobertas tardiamente são adicionadas ao metadata
- [ ] `/batch` re-executado quando spec muda de status

### Final da Sprint
- [ ] Todas as specs em `status: done` ou documentado por quê não
- [ ] PRs mergeados
- [ ] Retrospectiva inclui: "a decomposição foi boa? Índice de paralelismo real vs planejado?"
