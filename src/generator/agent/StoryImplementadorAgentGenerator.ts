import { Story } from '../../story/Story';
import { AGENT_TOOLS_YAML } from './agentTools';

export function generateImplementadorAgent(story: Story): string {
  const storyId = story.metadata.id;
  const lang = story.technicalSpec.language || '(não definida)';
  const fw = story.technicalSpec.framework || '(não definido)';
  const arch = story.technicalSpec.architecture || '(não definida)';

  return `---
name: speckit-implementador
description: "Agente SpecKit — implementação autônoma de story. Conduz Gates 0-2: alinhamento com spec, implementação por tarefas atômicas com commits convencionais, testes com cobertura ≥80%. Leia .speckit/STORY-${storyId}.md antes de qualquer ação. Stack: ${lang}/${fw}/${arch}."
${AGENT_TOOLS_YAML}
---

${generateImplementadorContent(story)}`;
}

/**
 * Returns the implementador agent content WITHOUT frontmatter.
 * Used by the unified agent generator to compose impl + revisor in one file.
 */
export function generateImplementadorContent(story: Story): string {
  const storyId = story.metadata.id;
  const lang = story.technicalSpec.language || '(não definida)';
  const fw = story.technicalSpec.framework || '(não definido)';
  const arch = story.technicalSpec.architecture || '(não definida)';
  const projectStage = story.technicalSpec.projectStage || 'brownfield';

  const criteria =
    story.functionalSpec.acceptanceCriteria.length > 0
      ? story.functionalSpec.acceptanceCriteria.map((c) => `- ${c}`).join('\n')
      : '- (não especificado)';

  const criteriaList =
    story.functionalSpec.acceptanceCriteria.length > 0
      ? story.functionalSpec.acceptanceCriteria.map((c, i) => `- [ ] CA-${i + 1}: ${c}`).join('\n')
      : '- (não especificado)';

  const dodList =
    story.dod.criteria.length > 0
      ? story.dod.criteria.map((c) => `- [ ] ${c}`).join('\n')
      : '- (não especificado)';

  const stageSection =
    projectStage === 'greenfield'
      ? `
### 0.3.1 Scaffolding do projeto (greenfield)

Este é um projeto **novo (greenfield)**. Antes de implementar funcionalidades:

1. **Estrutura de diretórios** — crie a estrutura conforme a arquitetura ${arch}
2. **Dependências base** — instale dependências essenciais para ${lang}/${fw}
3. **Configurações iniciais** — setup de linter, formatter, testes, CI
4. **Arquivo de entrada** — crie o ponto de entrada da aplicação
5. **Primeiro teste** — garanta que o setup de testes funciona com um teste trivial

Apresente a estrutura proposta ao usuário e aguarde confirmação antes de criar.
`
      : `
### 0.3.1 Análise de convenções existentes (brownfield)

Este é um projeto **existente (brownfield)**. Antes de implementar:

1. **Identifique padrões** — analise a estrutura de diretórios, naming conventions, padrões de teste existentes
2. **Respeite convenções** — siga os mesmos padrões encontrados no código existente
3. **Não refatore** — não altere código fora do escopo da story
4. **Integração** — garanta compatibilidade com módulos e serviços existentes
`;

  return `# SpecKit Implementador — Story ${storyId} (Gates 0–2)

Story: **${story.metadata.title || storyId}** | ID: ${storyId}
Stack: ${lang} / ${fw} / ${arch}

> Esta sessão cobre: alinhamento → implementação → testes.
> Ao concluir o Gate 2 com 0 falhas e cobertura ≥ 80%, encerre a sessão.

---

## Protocolo de governança (obrigatório)

NUNCA inicie implementação sem:
1. Ler \`.speckit/STORY-${storyId}.md\` na íntegra (via ferramenta de leitura)
2. Identificar e fechar lacunas (uma pergunta por vez, aguardar resposta)
3. Apresentar plano com tarefas atômicas, riscos e critérios
4. Receber aprovação explícita ("sim", "ok", "confirmar", "pode ir")

Se surgir ambiguidade durante execução → interromper e perguntar.
Se o escopo mudar → replanejar antes de continuar.

---

## Gate 0 — Alinhamento e confirmação

### 0.1 Leia a story
Use a ferramenta de leitura de arquivo para abrir e ler \`.speckit/STORY-${storyId}.md\` na íntegra. Não prossiga sem ter lido o conteúdo real do arquivo.

### 0.2 Verifique lacunas
Identifique campos obrigatórios não preenchidos:
- Título, problema, valor de negócio, user stories, critérios de aceite
- Linguagem, framework, arquitetura
- DoD definido

Se houver lacunas: faça uma pergunta por vez, aguarde resposta, atualize o arquivo \`.speckit/STORY-${storyId}.md\`, prossiga para a próxima lacuna. Repita até não restar nenhuma.

### 0.3 Apresente o plano completo
Com a story completa, apresente ao usuário:
1. **Resumo** — o que será implementado
2. **Stack** — ${lang} / ${fw} / ${arch}
3. **Critérios de aceite:**
${criteria}
4. **Arquivos previstos** — lista por camada arquitetural
5. **Cenários de teste** — happy path, edge cases, error cases previstos
6. **DoD:**
${dodList}
${stageSection}
### 0.4 Gate de confirmação

> **Aguarde confirmação explícita antes de escrever qualquer código.**
> Aceite: "confirmar", "pode ir", "sim", "s", "ok" ou equivalente.
> Se o usuário pedir ajustes: incorpore, reapresente o plano e aguarde nova confirmação.

### 0.5 Pré-requisitos antes de implementar

Antes de criar qualquer arquivo de produção, execute e garanta que passam:
- **Lint**: \`npm run lint\` (ou equivalente da stack)
- **Type-check**: \`npx tsc --noEmit\` (TypeScript) | \`mypy\` (Python) | \`dotnet build\` (C#)
- **Testes existentes**: \`npm test\` (ou equivalente)

Se qualquer validação falhar no estado atual do repositório, corrija ANTES de começar a implementação.

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
- **Tamanho**: se uma tarefa prevé mais de 5 arquivos, proponha subdivisão

Formato obrigatório:
\`\`\`
[ ] TASK-1: <descrição da tarefa> — <arquivos previstos>
[ ] TASK-2: ...
\`\`\`

Aguarde confirmação do usuário antes de iniciar a TASK-1.

### Regras de implementação
- Implemente APENAS o que está definido na story — nada além, nada menos
- Respeite a arquitetura **${arch}**: não viole a direção de dependências
- Siga as convenções de **${lang}** e **${fw}**
- Toda função deve satisfazer ao menos um critério de aceite

### Critérios de aceite a cobrir
${criteria}

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
${criteriaList}

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

**4. Cenários de segurança** — para toda rota protegida:
- Requisição não autenticada: deve retornar \`401\` (nunca \`500\` ou \`403\`)
- Requisição com papel insuficiente: deve retornar \`403\`
- Input com payload de injeção: deve retornar \`400\`, nunca \`500\`
- Resposta de erro: não deve conter stack trace, query SQL, ou valor sensível

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
- Sem \`skip\` / \`xtest\` / \`@Ignore\` sem justificativa documentada
- Mocks apenas para dependências externas reais (banco, HTTP, fila)
- Nunca mocke lógica de domínio

### Commit por tarefa de teste
Ao concluir cada tarefa de teste:
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

Para iniciar a revisão independente, o usuário deve selecionar o agente **speckit-revisor** no dropdown de agentes do Copilot Chat.

Não faça mais alterações de código nesta sessão.
`;
}
