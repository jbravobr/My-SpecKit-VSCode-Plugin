import { Story, Gap } from '../../story/Story';

export function generateImplementPrompt(story: Story): string {
  const storyId = story.metadata.id || '001';
  const criteria = story.functionalSpec.acceptanceCriteria.map(c => `- [ ] ${c}`).join('\n');
  const criteriaList = story.functionalSpec.acceptanceCriteria.map(c => `- ${c}`).join('\n');
  const dodList = story.dod.criteria.map(c => `- [ ] ${c}`).join('\n');

  return `# Implement Story — Sessão A (Gates 0–2)

Story: **${story.metadata.title || storyId}** | ID: ${storyId}
Stack: ${story.technicalSpec.language} / ${story.technicalSpec.framework} / ${story.technicalSpec.architecture}

> Esta sessão cobre: alinhamento → implementação → testes.
> Ao concluir o Gate 2 com 0 falhas e cobertura ≥ 80%, você receberá
> instruções para iniciar a revisão independente.

---

## FASE 0 — Alinhamento e confirmação

### 0.1 Leia a story
Leia \`.speckit/STORY-${storyId}.md\` na íntegra antes de qualquer outra ação.

### 0.2 Verifique lacunas
Identifique campos obrigatórios não preenchidos:
- Título, problema, valor de negócio, user stories, critérios de aceite
- Linguagem, framework, arquitetura
- DoD definido

Se houver lacunas: faça uma pergunta por vez, aguarde resposta, atualize o arquivo \`.speckit/STORY-${storyId}.md\`, prossiga para a próxima lacuna. Repita até não restar nenhuma.

### 0.3 Apresente o plano completo
Com a story completa, apresente ao usuário:
1. **Resumo** — o que será implementado
2. **Stack** — ${story.technicalSpec.language} / ${story.technicalSpec.framework} / ${story.technicalSpec.architecture}
3. **Critérios de aceite:**
${criteria || '   - (não especificado)'}
4. **Arquivos previstos** — lista por camada arquitetural
5. **Cenários de teste** — happy path, edge cases, error cases previstos
6. **DoD:**
${dodList || '   - (não especificado)'}

### 0.4 Gate de confirmação

> **Aguarde confirmação explícita antes de escrever qualquer código.**
> Aceite: "confirmar", "pode ir", "sim", "s", "ok" ou equivalente.
> Se o usuário pedir ajustes: incorpore, reapresente o plano e aguarde nova confirmação.

---

## Gate 1 — Implementação

### Setup git
\`\`\`bash
git checkout develop && git pull
git checkout -b feature/${storyId}-<slug>
\`\`\`

### Planejamento de tarefas (faça ANTES de escrever qualquer código)

Defina a lista de tarefas atômicas a implementar. Cada tarefa deve:
- Ser completa em si mesma (compila, não quebra os testes existentes)
- Corresponder a uma camada, módulo ou critério de aceite
- Resultar em um commit convencional ao ser concluída

Critérios de corte:
- **Por critério de aceite**: 1 tarefa = 1 critério de aceite
- **Por camada** (arquitetura layered/hexagonal): domain → application → infrastructure → api
- **Tamanho**: se uma tarefa prevê mais de 5 arquivos, proponha subdivisão

Formato obrigatório:
\`\`\`
[ ] TASK-1: <descrição da tarefa> — <arquivos previstos>
[ ] TASK-2: ...
\`\`\`

Aguarde confirmação do usuário antes de iniciar a TASK-1.

### Regras de implementação
- Implemente APENAS o que está definido na story — nada além, nada menos
- Respeite a arquitetura **${story.technicalSpec.architecture}**: não viole a direção de dependências
- Siga as convenções de **${story.technicalSpec.language}** e **${story.technicalSpec.framework}** (ver \`instructions/\`)
- Toda função deve satisfazer ao menos um critério de aceite

### Critérios de aceite a cobrir
${criteria || '- (não especificado)'}

### Commit por tarefa implementada
Ao concluir cada tarefa:
\`\`\`bash
git add <arquivos específicos da tarefa>
git commit -m "feat(${storyId}): TASK-N — <descrição>"
\`\`\`

Só avance para a próxima tarefa após o commit ser concluído sem erros.

**Não avance para o Gate 2 sem:**
- [ ] Todos os testes passando
- [ ] Cobertura ≥ 80%

---

## Gate 2 — Testes

### Planejamento das tarefas de teste (faça ANTES de escrever qualquer teste)

Defina a lista de tarefas de teste atômicas. Cada tarefa deve:
- Cobrir um critério de aceite ou cenário isolado (happy path, edge, error)
- Ser executável independentemente das demais
- Resultar em um commit ao ser concluída

Formato obrigatório:
\`\`\`
[ ] TEST-1: <descrição> — <arquivo(s) de teste>
[ ] TEST-2: ...
\`\`\`

### Cobertura obrigatória
- **Mínimo: 80%** — condição obrigatória para encerramento da story
- Meta ideal: ≥ 90% para lógica de domínio e casos de uso
- Apresente o relatório de cobertura ao final deste gate

### Cenários obrigatórios

**1. Happy path** — um teste por critério de aceite:
${criteriaList || '- (não especificado)'}

**2. Edge cases** — para toda função/método:
- Entrada nula ou vazia (null, undefined, "", [], {})
- Valores no limite (zero, negativo, máximo permitido)
- Coleções com 0 e 1 elementos
- Strings com caracteres especiais, espaços, unicode

**3. Error cases** — para toda operação com falha possível:
- Recurso não encontrado (404 / NotFound / None)
- Dados de entrada inválidos (validação falha)
- Conflito de estado (duplicidade, concorrência)
- Permissão negada (autorização)
- Falha de dependência externa (mockada)

**4. Cenários da story** — todos os cenários trazidos pelo usuário durante o preenchimento

**5. Cenários derivados** — casos que emergem da implementação; documente com comentário

**6. Cenários de segurança** — para toda rota protegida ou operação com dado sensível:
- Requisição não autenticada: deve retornar \`401\` (nunca \`500\` ou \`403\`)
- Requisição com papel insuficiente: deve retornar \`403\`
- Input com caractere especial / payload de injeção: deve retornar \`400\`, nunca \`500\`
- Resposta de erro: não deve conter stack trace, query SQL, ou valor de campo sensível

### Estrutura obrigatória (AAA)
\`\`\`
// Arrange — configure o estado inicial
// Act    — execute a operação
// Assert — verifique o resultado
\`\`\`

Cada teste tem exatamente um motivo para falhar.
Nome descreve o comportamento: \`deve_<resultado>_quando_<condição>\`

### Restrições
- Sem testes sem assertivas
- Sem \`skip\` / \`xtest\` / \`@Ignore\` sem justificativa documentada + issue de rastreamento
- Mocks apenas para dependências externas reais (banco de dados, HTTP, fila)
- Nunca mocke lógica de domínio

### Commit por tarefa de teste
Ao concluir cada tarefa de teste, execute os testes da tarefa:
\`\`\`bash
npm test -- --coverage     # Node.js
./mvnw test                # Java/Maven
dotnet test --collect:"XPlat Code Coverage"  # .NET
pytest --cov=. --cov-report=term-missing     # Python
\`\`\`

Se todos passarem:
\`\`\`bash
git add <arquivos de teste da tarefa>
git commit -m "test(${storyId}): TEST-N — <descrição>"
\`\`\`

Só avance para a próxima tarefa após 0 falhas e commit concluído.

**Não avance para o handoff sem:**
- [ ] 0 (zero) falhas
- [ ] Cobertura ≥ 80% com relatório exibido

---

## Sessão A concluída

Gates 0–2 completos. Para iniciar a revisão independente:

> Execute \`@speckit /review\` no Copilot Chat.

Não faça mais alterações de código nesta sessão.
`;
}

// @deprecated — conteúdo absorvido por generateImplementPrompt (PORTÃO 2)
export function generateWriteTestsPrompt(story: Story): string {
  const criteria = story.functionalSpec.acceptanceCriteria.map(c => `- ${c}`).join('\n');
  const dod = story.dod.criteria.map(c => `- [ ] ${c}`).join('\n');
  return `# Write Tests

Story: **${story.metadata.title || story.metadata.id}**
Stack: ${story.technicalSpec.language} / ${story.technicalSpec.framework} / ${story.technicalSpec.architecture}

---

## Requisito de cobertura
- **Mínimo: 80%** — condição obrigatória para encerramento da story
- Meta ideal: ≥ 90% para lógica de domínio e casos de uso
- Apresente o relatório de cobertura ao final

---

## Cenários obrigatórios

### 1. Happy path
Cada critério de aceite deve ter ao menos um teste que valida o fluxo principal:
${criteria || '- (não especificado)'}

### 2. Edge cases — obrigatórios para TODA função/método
- Entrada nula ou vazia (null, undefined, "", [], {})
- Valores no limite (zero, negativo, máximo permitido)
- Coleções com 0 e 1 elementos
- Strings com caracteres especiais, espaços, unicode

### 3. Error cases — obrigatórios para TODA operação com falha possível
- Recurso não encontrado (404 / NotFound / None)
- Dados de entrada inválidos (validação falha)
- Conflito de estado (duplicidade, concorrência)
- Permissão negada (autorização)
- Falha de dependência externa (mockada)

### 4. Cenários da story
Todos os cenários trazidos pelo usuário durante a criação da história devem ter teste explícito.

### 5. Cenários derivados
Casos que emergem da implementação real e não estavam na spec original — documente com comentário.

---

## Estrutura de cada teste (AAA obrigatório)
\`\`\`
// Arrange — configure o estado inicial
// Act — execute a operação
// Assert — verifique o resultado
\`\`\`

Cada teste tem exatamente um motivo para falhar.
Nome descreve o comportamento: \`deve_<resultado>_quando_<condição>\`

---

## Restrições
- Sem testes sem assertivas
- Sem \`skip\` / \`xtest\` / \`@Ignore\` sem justificativa documentada + issue de rastreamento
- Mocks apenas para dependências externas reais (banco de dados, HTTP, fila)
- Nunca mocke lógica de domínio

---

## DoD — lembre-se
${dod || '- (não especificado)'}

---

## Ao final: execute e apresente
\`\`\`bash
# Adapte ao runner da stack
npm test -- --coverage
./mvnw test
dotnet test --collect:"XPlat Code Coverage"
pytest --cov=. --cov-report=term-missing
\`\`\`

Só declare os testes concluídos quando o relatório mostrar cobertura ≥ 80% com 0 falhas.
`;
}

export function generateReviewPrompt(story: Story): string {
  const storyId = story.metadata.id || '001';
  const criteria = story.functionalSpec.acceptanceCriteria.map(c => `- [ ] ${c}`).join('\n');
  const dodList = story.dod.criteria.map(c => `- [ ] ${c}`).join('\n');
  const hasKafka = (story.technicalSpec.infrastructure ?? '').toLowerCase().includes('kafka');
  const performanceCheck = hasKafka
    ? 'Throughput / consumer lag (P99 não se aplica a consumers async — usar SLO de lag)'
    : (story.nonFunctionalSpec.performance?.trim() || 'P99 < 500ms (baseline padrão)');
  const scalabilityLine = story.nonFunctionalSpec.scalability?.trim()
    ? `\n- [ ] Escalabilidade (código): ${story.nonFunctionalSpec.scalability.trim()}`
    : '';

  return `# Review Story — Sessão B (Gates 3–4)

Story: **${story.metadata.title || storyId}** | ID: ${storyId}
Stack: ${story.technicalSpec.language} / ${story.technicalSpec.framework} / ${story.technicalSpec.architecture}

> Você é um revisor independente. Não participou da implementação.
> Não presuma nada sobre as decisões tomadas — avalie apenas o que está no código.

---

## Contexto de entrada — leitura obrigatória

Antes de iniciar qualquer avaliação:

1. Leia \`.speckit/STORY-${storyId}.md\` na íntegra
2. Liste os arquivos da feature:
   \`\`\`bash
   git diff develop...HEAD --name-only
   \`\`\`
3. Leia cada arquivo modificado
4. Solicite ao usuário que cole o relatório de cobertura da Sessão A

Só inicie o checklist após concluir os 4 passos acima.

**Regra do revisor independente:** ao encontrar uma decisão questionável, pergunte a razão ao usuário antes de marcar como bloqueante — não assuma que foi intencional ou que foi erro.

---

## Gate 3 — Revisão

### Funcionalidade
${criteria || '- [ ] (critérios não especificados)'}

### Arquitetura (${story.technicalSpec.architecture})
- [ ] Direção de dependências respeitada
- [ ] Sem imports de infraestrutura no domínio
- [ ] Responsabilidades bem separadas por camada

### Qualidade de código
- [ ] Segue convenções de **${story.technicalSpec.language}** (ver \`instructions/lang-*\`)
- [ ] Segue convenções de **${story.technicalSpec.framework}** (ver \`instructions/fw-*\`)
- [ ] Sem código morto ou comentado sem justificativa

### Testes
- [ ] 0 (zero) falhas (evidência: relatório da Sessão A)
- [ ] Cobertura ≥ 80% (relatório obrigatório)
- [ ] Happy path coberto para cada critério de aceite
- [ ] Edge cases cobertos (null, vazio, limites)
- [ ] Error cases cobertos (not found, inválido, permissão)
- [ ] Sem testes ignorados sem justificativa

### Testes de Segurança
- [ ] Toda rota protegida testada sem token: retorna \`401\`
- [ ] Toda rota protegida testada com papel insuficiente: retorna \`403\`
- [ ] Input inválido / malicioso não retorna \`500\` — retorna \`400\` com ProblemDetail
- [ ] Mensagem de erro não expõe stack trace, query SQL ou dados internos ao cliente
- [ ] Campos sensíveis (token, senha, chave) ausentes nos DTOs de resposta e nos logs

### Observabilidade
- [ ] Endpoint de health check presente e respondendo sem autenticação
- [ ] Logs estruturados com \`traceId\` / \`requestId\` em todas as operações
- [ ] \`traceId\` propagado para respostas de erro (campo \`traceId\` no ProblemDetail)
- [ ] Nenhum dado sensível nos logs (senha, token, PII não auditável)

### Requisitos não-funcionais
- [ ] Performance: ${performanceCheck}
- [ ] Segurança: ${story.nonFunctionalSpec.security || '(não especificado)'}${scalabilityLine}
- [ ] Idempotência: operações de escrita não duplicam estado — Idempotency-Key ou deduplicação por chave de negócio presente

### Git
- [ ] Branch segue padrão \`feature/${storyId}-<slug>\`
- [ ] Commits seguem Conventional Commits
- [ ] Sem commits com mensagem genérica ("fix", "wip", "test")
- [ ] Nenhum commit direto em \`develop\` ou \`main\`

### DoD
${dodList || '- [ ] (não especificado)'}

### Formato do veredito
1. **Veredito**: APROVADO / ALTERAÇÕES SOLICITADAS
2. **Bloqueantes**: itens que impedem a entrega (falha funcional, teste falhando, cobertura < 80%)
3. **Melhorias**: recomendados mas não bloqueantes
4. **Sugestões fora de escopo**: registre, não implemente

**Se veredito for APROVADO:** avance diretamente para o Gate 4.

**Se veredito for ALTERAÇÕES SOLICITADAS:**

### Planejamento das tarefas de correção (faça ANTES de escrever qualquer fix)

Liste os bloqueantes e converta cada um em uma tarefa atômica de correção. Cada tarefa deve:
- Corrigir exatamente um bloqueante identificado no veredito
- Ser completa em si mesma (compila, testes existentes não quebram)
- Resultar em um commit convencional ao ser concluída

Formato obrigatório:
\`\`\`
[ ] FIX-1: <bloqueante corrigido> — <arquivos previstos>
[ ] FIX-2: ...
\`\`\`

### Commit por tarefa de correção
Ao concluir cada FIX:
\`\`\`bash
git add <arquivos específicos do fix>
git commit -m "fix(${storyId}): FIX-N — <descrição>"
\`\`\`

Só avance para o próximo FIX após o commit ser concluído sem erros.

### Revalidação após todos os fixes
Execute os testes e reexecute o checklist do Gate 3 completo:
\`\`\`bash
<runner da stack>
\`\`\`
Só avance para o Gate 4 após novo veredito: APROVADO.

---

## Gate 4 — Entrega

### Passo 1 — Sincronize com develop (rebase)
\`\`\`bash
git fetch origin
git rebase origin/develop
\`\`\`

Se houver conflitos: resolva-os, execute \`git rebase --continue\`.
Não use \`git rebase --skip\` sem confirmar que o conflito foi intencionalmente descartado.

### Passo 2 — Reexecute os testes (evidência final obrigatória)
\`\`\`bash
npm test -- --coverage
./mvnw test
dotnet test --collect:"XPlat Code Coverage"
pytest --cov=. --cov-report=term-missing
\`\`\`

Critérios:
- [ ] 0 (zero) testes falhando
- [ ] Cobertura ≥ 80% (apresente o relatório completo)

Se qualquer item falhar: corrija, faça commit atômico e reexecute. Não avance.

### Passo 3 — Valide o DoD
${dodList || '- [ ] (critérios não definidos na story)'}

Todos os itens devem estar marcados antes de prosseguir.

### Passo 3.5 — Prod Readiness
- [ ] Health check endpoint acessível sem autenticação e respondendo \`200\`
- [ ] Nenhuma credencial hardcoded ou em variável de ambiente definida manualmente no código
- [ ] Logs estruturados com \`traceId\` — verificado com execução local
- [ ] Sem dados sensíveis em mensagens de log: grep por \`password\`, \`secret\`, \`token\` nos logs de startup
- [ ] Sem \`System.out.println\`, \`console.log\`, \`print()\` de debug remanescentes em produção

### Passo 4 — Commit de fechamento (somente se houver arquivos pendentes)
\`\`\`bash
git status
\`\`\`

Se o veredito foi APROVADO de imediato (sem correções no Gate 3), comite a implementação:
\`\`\`bash
git add <arquivos específicos da story>
git commit -m "feat(${storyId}): <descrição do que foi implementado>"
\`\`\`

Se correções foram feitas no Gate 3, os commits \`fix(${storyId}): FIX-N\` já foram realizados.
Só faça um commit adicional se \`git status\` mostrar arquivos ainda não comitados:
\`\`\`bash
git add <arquivos pendentes>
git commit -m "fix(${storyId}): ajustes pós-revisão"
\`\`\`

### Passo 5 — Encerramento da story no SpecKit
Após o commit de entrega, marque a story como concluída:
Abra \`.speckit/STORY-${storyId}.md\` e substitua \`status: open\` por \`status: done\` no bloco \`<!-- metadata -->\`.
\`\`\`bash
git add .speckit/STORY-${storyId}.md
git commit -m "chore(${storyId}): encerra story no speckit"
\`\`\`

---

## Declaração de conclusão

Somente após todos os gates concluídos com sucesso, emita:

> **Story ${storyId} CONCLUÍDA.** Testes: 100% passando. Cobertura: X%.
> Commit local na branch \`feature/${storyId}-<slug>\`.
`;
}

// @deprecated — conteúdo absorvido por generateReviewPrompt (PORTÃO 4)
export function generateFinalizePrompt(story: Story): string {
  const dod = story.dod.criteria.map(c => `- [ ] ${c}`).join('\n');
  return `# Finalize Story — Portão de Entrega

Story: **${story.metadata.title || story.metadata.id}**

> Este prompt só deve ser executado quando a implementação e os testes estiverem completos.
> O agente só pode declarar a story como CONCLUÍDA após validar TODOS os itens abaixo.

---

## Passo 1 — Execute os testes e apresente o resultado

\`\`\`bash
# Adapte ao runner da stack
npm test -- --coverage
./mvnw test
dotnet test --collect:"XPlat Code Coverage"
pytest --cov=. --cov-report=term-missing
\`\`\`

**Critérios de aprovação obrigatórios:**
- [ ] 0 (zero) testes falhando
- [ ] Cobertura ≥ 80% (apresente o relatório completo)

Se qualquer item acima falhar: **pare aqui**, corrija e reexecute. Não avance.

---

## Passo 2 — Valide o DoD

${dod || '- [ ] (critérios não definidos na story)'}

Todos os itens acima devem estar marcados antes de prosseguir.

---

## Passo 3 — Commit local

\`\`\`bash
# Garanta que está na branch correta
git status

# Stage somente os arquivos da story
git add <arquivos específicos>

# Commit seguindo Conventional Commits
git commit -m "feat(${story.metadata.id}): <descrição do que foi implementado>"
\`\`\`

---

## Declaração de conclusão

O agente só pode emitir a frase abaixo após todos os passos acima concluídos com sucesso:

> **Story ${story.metadata.id} CONCLUÍDA.** Testes: 100% passando. Cobertura: X%. Commit local na branch \`feature/${story.metadata.id}-<slug>\`.
`;
}

export function generateGapFillingPrompt(story: Story, gaps: Gap[]): string {
  const storyId = story.metadata.id || '001';
  const gapList = gaps
    .map(g => `- **[${g.section}]** \`${g.field}\`: ${g.message}`)
    .join('\n');

  return `# Story Alignment — Preenchimento de Lacunas

Story: **${story.metadata.title || storyId}** | ID: ${storyId}
Arquivo: \`.speckit/STORY-${storyId}.md\`

## Lacunas identificadas (${gaps.length})

${gapList}

---

## Instruções para o agente

Conduza uma conversa estruturada para preencher cada lacuna acima:

1. **Apresente a primeira lacuna** como pergunta objetiva e direta ao usuário
2. **Aguarde a resposta**
3. **Atualize o arquivo** \`.speckit/STORY-${storyId}.md\` com a resposta recebida
4. **Prossiga para a próxima lacuna** — uma por vez, sem agrupamentos
5. **Repita** até que não reste nenhuma lacuna

### Regras
- Uma pergunta por vez — nunca agrupe múltiplas lacunas numa só mensagem
- Nunca invente ou assuma uma resposta — pergunte explicitamente
- Atualize o arquivo imediatamente após cada resposta, antes de perguntar a próxima
- Se a resposta for ambígua, peça esclarecimento antes de atualizar

---

## Após todas as lacunas resolvidas

Informe o usuário:

> Todas as lacunas foram preenchidas. Informe ao usuário que pode digitar \`/validate\` neste chat para gerar os arquivos de configuração e iniciar a implementação.
`;
}

export function generateRunPrompt(story: Story): string {
  const storyId = story.metadata.id || '001';
  const criteria = story.functionalSpec.acceptanceCriteria.map(c => `- [ ] ${c}`).join('\n');
  const dodList = story.dod.criteria.map(c => `- [ ] ${c}`).join('\n');

  return `# Run Story — Modo Monolítico

Story: **${story.metadata.title || storyId}** | ID: ${storyId}
Stack: ${story.technicalSpec.language} / ${story.technicalSpec.framework} / ${story.technicalSpec.architecture}

> **MODO MONOLÍTICO** — todos os gates em uma única sessão.
> Recomendado para: hotfixes, chores, tasks de escopo pequeno.
> Para features com lógica de negócio: use \`/validate\` + \`/review\`
> para obter revisão por agente independente (melhor qualidade).

---

## FASE 0 — Alinhamento e confirmação

### 0.1 Leia a story
Leia \`.speckit/STORY-${storyId}.md\` na íntegra antes de qualquer outra ação.

### 0.2 Verifique lacunas
Identifique campos obrigatórios não preenchidos:
- Título, problema, valor de negócio, user stories, critérios de aceite
- Linguagem, framework, arquitetura
- DoD definido

Se houver lacunas: faça uma pergunta por vez, aguarde resposta, atualize o arquivo \`.speckit/STORY-${storyId}.md\`, prossiga para a próxima lacuna. Repita até não restar nenhuma.

### 0.3 Apresente o plano completo
Com a story completa, apresente ao usuário:
1. **Resumo** — o que será implementado
2. **Stack** — ${story.technicalSpec.language} / ${story.technicalSpec.framework} / ${story.technicalSpec.architecture}
3. **Critérios de aceite:**
${criteria || '   - (não especificado)'}
4. **Arquivos previstos** — lista por camada arquitetural
5. **Cenários de teste** — happy path, edge cases, error cases previstos
6. **DoD:**
${dodList || '   - (não especificado)'}

### 0.4 Gate de confirmação

> **Aguarde confirmação explícita antes de escrever qualquer código.**
> Aceite: "confirmar", "pode ir", "sim", "s", "ok" ou equivalente.
> Se o usuário pedir ajustes: incorpore, reapresente o plano e aguarde nova confirmação.

---

## Gate 1 — Implementação

### Setup git
\`\`\`bash
git checkout develop && git pull
git checkout -b feature/${storyId}-<slug>
\`\`\`

### Planejamento de tarefas (faça ANTES de escrever qualquer código)

Defina a lista de tarefas atômicas a implementar. Cada tarefa deve:
- Ser completa em si mesma (compila, não quebra os testes existentes)
- Corresponder a uma camada, módulo ou critério de aceite
- Resultar em um commit convencional ao ser concluída

Critérios de corte:
- **Por critério de aceite**: 1 tarefa = 1 critério de aceite
- **Por camada** (arquitetura layered/hexagonal): domain → application → infrastructure → api
- **Tamanho**: se uma tarefa prevê mais de 5 arquivos, proponha subdivisão

Formato obrigatório:
\`\`\`
[ ] TASK-1: <descrição da tarefa> — <arquivos previstos>
[ ] TASK-2: ...
\`\`\`

Aguarde confirmação do usuário antes de iniciar a TASK-1.

### Regras de implementação
- Implemente APENAS o que está definido na story — nada além, nada menos
- Respeite a arquitetura **${story.technicalSpec.architecture}**: não viole a direção de dependências
- Siga as convenções de **${story.technicalSpec.language}** e **${story.technicalSpec.framework}** (ver \`instructions/\`)
- Toda função deve satisfazer ao menos um critério de aceite

### Critérios de aceite a cobrir
${criteria || '- (não especificado)'}

### Commit por tarefa implementada
Ao concluir cada tarefa:
\`\`\`bash
git add <arquivos específicos da tarefa>
git commit -m "feat(${storyId}): TASK-N — <descrição>"
\`\`\`

Só avance para a próxima tarefa após o commit ser concluído sem erros.

**Não avance para o Gate 2 sem:**
- [ ] Todos os testes passando
- [ ] Cobertura ≥ 80%

---

## Gate 2 — Testes

### Planejamento das tarefas de teste (faça ANTES de escrever qualquer teste)

Defina a lista de tarefas de teste atômicas. Cada tarefa deve:
- Cobrir um critério de aceite ou cenário isolado (happy path, edge, error)
- Ser executável independentemente das demais
- Resultar em um commit ao ser concluída

Formato obrigatório:
\`\`\`
[ ] TEST-1: <descrição> — <arquivo(s) de teste>
[ ] TEST-2: ...
\`\`\`

### Cobertura obrigatória
- **Mínimo: 80%** — condição obrigatória para encerramento da story
- Apresente o relatório de cobertura ao final deste gate

### Cenários obrigatórios

**1. Happy path** — um teste por critério de aceite:
${story.functionalSpec.acceptanceCriteria.map(c => `- ${c}`).join('\n') || '- (não especificado)'}

**2. Edge cases** — para toda função/método:
- Entrada nula ou vazia (null, undefined, "", [], {})
- Valores no limite (zero, negativo, máximo)
- Coleções com 0 e 1 elementos

**3. Error cases** — para toda operação com falha possível:
- Recurso não encontrado
- Dados inválidos
- Permissão negada
- Falha de dependência externa (mockada)

**4. Cenários da story** — todos os cenários trazidos pelo usuário durante o preenchimento

**5. Cenários derivados** — casos que emergem da implementação; documente com comentário

### Estrutura obrigatória (AAA)
\`\`\`
// Arrange — configure o estado inicial
// Act    — execute a operação
// Assert — verifique o resultado
\`\`\`

### Restrições
- Sem testes sem assertivas
- Sem \`skip\` / \`xtest\` / \`@Ignore\` sem justificativa + issue de rastreamento
- Mocks apenas para dependências externas reais

### Commit por tarefa de teste
Ao concluir cada tarefa de teste, execute os testes da tarefa:
\`\`\`bash
npm test -- --coverage     # Node.js
./mvnw test                # Java/Maven
dotnet test --collect:"XPlat Code Coverage"  # .NET
pytest --cov=. --cov-report=term-missing     # Python
\`\`\`

Se todos passarem:
\`\`\`bash
git add <arquivos de teste da tarefa>
git commit -m "test(${storyId}): TEST-N — <descrição>"
\`\`\`

Só avance para a próxima tarefa após 0 falhas e commit concluído.

**Não avance para o Gate 3 sem:**
- [ ] 0 (zero) falhas
- [ ] Cobertura ≥ 80% com relatório exibido

---

## Gate 3 — Revisão

### Checklist de revisão

**Funcionalidade:**
${criteria || '- [ ] (critérios não especificados)'}

**Arquitetura (${story.technicalSpec.architecture}):**
- [ ] Direção de dependências respeitada
- [ ] Sem imports de infraestrutura no domínio
- [ ] Responsabilidades bem separadas por camada

**Qualidade de código:**
- [ ] Convenções de **${story.technicalSpec.language}** seguidas (ver \`instructions/lang-*\`)
- [ ] Convenções de **${story.technicalSpec.framework}** seguidas (ver \`instructions/fw-*\`)
- [ ] Sem código morto ou comentado sem justificativa

**Testes:**
- [ ] 0 (zero) falhas — execute o runner antes de marcar
- [ ] Cobertura ≥ 80% (relatório apresentado)
- [ ] Happy path coberto para cada critério de aceite
- [ ] Edge cases cobertos (null, vazio, limites)
- [ ] Error cases cobertos (not found, inválido, permissão)

**Testes de Segurança:**
- [ ] Toda rota protegida testada sem token: retorna \`401\`
- [ ] Input inválido não retorna \`500\`
- [ ] Mensagem de erro não expõe stack trace ou dados internos

**Segurança e Credenciais:**
- [ ] Nenhuma credencial hardcoded ou em variável de ambiente definida manualmente
- [ ] Campos sensíveis ausentes nos DTOs de resposta e nos logs

**Observabilidade:**
- [ ] Health endpoint acessível e respondendo
- [ ] Logs estruturados com \`traceId\` / \`requestId\`
- [ ] Nenhum dado sensível nos logs

**Não-funcionais:**
- [ ] Performance: ${story.nonFunctionalSpec.performance?.trim() || 'P99 < 500ms (baseline padrão)'}
- [ ] Segurança: ${story.nonFunctionalSpec.security || '(não especificado)'}

**Git:**
- [ ] Branch segue padrão \`feature/${storyId}-<slug>\`
- [ ] Commits seguem Conventional Commits
- [ ] Sem commits genéricos ("fix", "wip", "test")

**DoD:**
${dodList || '- [ ] (não especificado)'}

**Não avance para o Gate 4 sem veredito: APROVADO**

**Se veredito for ALTERAÇÕES SOLICITADAS:**

### Planejamento das tarefas de correção (faça ANTES de escrever qualquer fix)

Liste os bloqueantes e converta cada um em uma tarefa atômica de correção. Cada tarefa deve:
- Corrigir exatamente um bloqueante identificado no veredito
- Ser completa em si mesma (compila, testes existentes não quebram)
- Resultar em um commit convencional ao ser concluída

Formato obrigatório:
\`\`\`
[ ] FIX-1: <bloqueante corrigido> — <arquivos previstos>
[ ] FIX-2: ...
\`\`\`

### Commit por tarefa de correção
Ao concluir cada FIX:
\`\`\`bash
git add <arquivos específicos do fix>
git commit -m "fix(${storyId}): FIX-N — <descrição>"
\`\`\`

Só avance para o próximo FIX após o commit ser concluído sem erros.

### Revalidação após todos os fixes
Execute os testes e reexecute o checklist do Gate 2 + Gate 3 completos:
\`\`\`bash
<runner da stack>
\`\`\`
Só avance para o Gate 4 após novo veredito: APROVADO.

---

## Gate 4 — Entrega

### Passo 1 — Sincronize com develop (rebase)
\`\`\`bash
git fetch origin
git rebase origin/develop
\`\`\`

Se houver conflitos: resolva-os, execute \`git rebase --continue\`.
Não use \`git rebase --skip\` sem confirmar que o conflito foi intencionalmente descartado.

### Passo 2 — Reexecute os testes (evidência final obrigatória)
\`\`\`bash
npm test -- --coverage
./mvnw test
dotnet test --collect:"XPlat Code Coverage"
pytest --cov=. --cov-report=term-missing
\`\`\`

Critérios:
- [ ] 0 (zero) testes falhando
- [ ] Cobertura ≥ 80% (apresente o relatório completo)

Se qualquer item falhar: corrija, faça commit atômico e reexecute. Não avance.

### Passo 3 — Valide o DoD
${dodList || '- [ ] (critérios não definidos na story)'}

Todos os itens devem estar marcados antes de prosseguir.

### Passo 3.5 — Prod Readiness
- [ ] Health check endpoint acessível sem autenticação e respondendo \`200\`
- [ ] Nenhuma credencial hardcoded ou em variável de ambiente definida manualmente no código
- [ ] Logs estruturados com \`traceId\` — verificado com execução local
- [ ] Sem dados sensíveis em mensagens de log: grep por \`password\`, \`secret\`, \`token\` nos logs de startup
- [ ] Sem \`System.out.println\`, \`console.log\`, \`print()\` de debug remanescentes em produção

### Passo 4 — Commit de fechamento (somente se houver arquivos pendentes)
\`\`\`bash
git status
\`\`\`

Se o veredito foi APROVADO de imediato (sem correções no Gate 3), comite a implementação:
\`\`\`bash
git add <arquivos específicos da story>
git commit -m "feat(${storyId}): <descrição do que foi implementado>"
\`\`\`

Se correções foram feitas no Gate 3, os commits \`fix(${storyId}): FIX-N\` já foram realizados.
Só faça um commit adicional se \`git status\` mostrar arquivos ainda não comitados:
\`\`\`bash
git add <arquivos pendentes>
git commit -m "fix(${storyId}): ajustes pós-revisão"
\`\`\`

---

## Declaração de conclusão

Somente após todos os gates concluídos com sucesso, emita:

> **Story ${storyId} CONCLUÍDA.** Testes: 100% passando. Cobertura: X%.
> Commit local na branch \`feature/${storyId}-<slug>\`.
`;
}
