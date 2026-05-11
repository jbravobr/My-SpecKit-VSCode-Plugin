import { Story } from '../../story/Story';
import {
  detectStoryBranchMentions,
  generateRuntimeBranchGovernanceSection,
} from '../utils/BranchGovernance';

export function generateImplementPrompt(story: Story): string {
  const storyId = story.metadata.id || '001';
  const criteria = story.functionalSpec.acceptanceCriteria.map((c) => `- [ ] ${c}`).join('\n');
  const criteriaList = story.functionalSpec.acceptanceCriteria.map((c) => `- ${c}`).join('\n');
  const dodList = story.dod.criteria.map((c) => `- [ ] ${c}`).join('\n');
  const branchGovernanceSection = generateRuntimeBranchGovernanceSection({
    mentions: detectStoryBranchMentions(story),
    defaultSessionBranch: `feature/${storyId}-<slug>`,
    sessionBranchLabel: 'a branch de trabalho confirmada para esta sessão',
    noLoopExample: '`develop`, `main` ou outra branch citada',
  });

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

${branchGovernanceSection ? `${branchGovernanceSection}---\n\n` : '---\n\n'}

## Gate 1 — Implementação

### Setup git
\`\`\`bash
git rev-parse --is-inside-work-tree
\`\`\`

> Se a governança de branch acima tiver concluído por "usar branch da sessão", o padrão abaixo vale como branch de trabalho default desta sessão.
> Se o usuário tiver decidido respeitar uma branch citada, substitua o alvo abaixo pela branch confirmada e não crie branch alternativa sem nova confirmação.

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

Gates 0–2 completos. **Encerre esta sessão.**

Para iniciar a revisão independente, o usuário deve abrir um novo Copilot Chat em modo Agente e digitar \`/review\`.

Não faça mais alterações de código nesta sessão.
`;
}

// @deprecated — conteúdo absorvido por generateImplementPrompt (PORTÃO 2)
export function generateWriteTestsPrompt(story: Story): string {
  const criteria = story.functionalSpec.acceptanceCriteria.map((c) => `- ${c}`).join('\n');
  const dod = story.dod.criteria.map((c) => `- [ ] ${c}`).join('\n');
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
