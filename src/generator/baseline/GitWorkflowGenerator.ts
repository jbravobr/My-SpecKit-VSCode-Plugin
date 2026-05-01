import { generateGenericGitRepositoryPreflightSection } from '../utils/GitRepositoryPreflight';

export function generateGitWorkflow(): string {
  return `---
applyTo: "**"
---
# Git Workflow — Gitflow Padrão

## Branches permanentes
- \`main\` — código em produção; nunca recebe commit direto
- \`develop\` — integração contínua; base para todas as features

## Branches temporárias
- \`feature/<story-id>-<slug>\` — uma branch por story (ex: \`feature/001-user-auth\`)
- \`release/<versão>\` — preparação de release; bump de versão e changelog
- \`hotfix/<slug>\` — correção urgente; parte de \`main\`, merge em \`main\` e \`develop\`

${generateGenericGitRepositoryPreflightSection()}

## Fluxo obrigatório por story
1. Sempre parta de \`develop\` atualizado: \`git checkout develop && git pull\`
2. Crie a branch da feature: \`git checkout -b feature/<story-id>-<slug>\`
3. Desenvolva com commits atômicos seguindo Conventional Commits
4. Execute os testes — todos devem passar com cobertura ≥ 80%
5. Faça o commit final local na branch da feature

## Exceção — /batch --generate --unified
- Use uma **branch única do lote** (ex: \`feature/batch-<yyyymmdd>-<slug>\`)
- Não crie \`feature/<story-id>-<slug>\` dentro do fluxo batch unificado
- Não empilhe branch de uma story sobre outra
- Todos os commits das stories do lote devem permanecer na mesma branch de integração

## Conventional Commits — formato obrigatório
\`\`\`
<tipo>(<escopo>): <descrição curta em inglês>

[corpo opcional em português]
\`\`\`

Tipos válidos:
- \`feat\` — nova funcionalidade
- \`fix\` — correção de bug
- \`test\` — adição ou correção de testes
- \`refactor\` — refatoração sem mudança de comportamento
- \`docs\` — documentação
- \`chore\` — build, dependências, configuração

## Regras inegociáveis
- Commits atômicos: uma mudança lógica por commit
- Nunca commite código com testes falhando
- Nunca commite diretamente em \`develop\` ou \`main\`
- Mensagem do commit no imperativo: "add", "fix", "remove" — não "added", "fixed"
`;
}
