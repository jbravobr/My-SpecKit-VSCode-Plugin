export function generateGitRepositoryPreflightSection(targetBranch: string): string {
  return `### Setup git resiliente

Antes de qualquer \`checkout\`, \`pull\` ou \`commit\`, verifique se o workspace é um repositório Git:

\`\`\`bash
git rev-parse --is-inside-work-tree
\`\`\`

- Se o comando passar, siga o fluxo normal:
\`\`\`bash
git checkout develop && git pull --ff-only
git checkout -b ${targetBranch}
\`\`\`
- Se falhar com \`not a git repository\`, inicialize o repositório e crie a branch de trabalho:
\`\`\`bash
git init
git checkout -b develop
git checkout -b ${targetBranch}
\`\`\`
- Se \`develop\` não existir em um repositório já inicializado, crie \`develop\` a partir do estado atual antes de criar \`${targetBranch}\`.

### Recuperação obrigatória para commit fora de repositório

Se qualquer \`git commit\` falhar com \`not a git repository\`:
1. Execute \`git init\` no workspace.
2. Execute \`git status\` para confirmar que o repositório foi inicializado.
3. Repita exatamente o mesmo \`git add\` e o mesmo \`git commit\` **uma única vez**.
4. Se o erro persistir, bloqueie a execução e reporte a saída completa.

Não execute \`git init\` para outros erros de commit, como hook falhando, conflito, identidade Git ausente ou mensagem inválida.
`;
}

export function generateGenericGitRepositoryPreflightSection(): string {
  return `## Pré-flight Git obrigatório

Antes de qualquer \`checkout\`, \`pull\` ou \`commit\`, valide o repositório com \`git rev-parse --is-inside-work-tree\`.

- Se falhar com \`not a git repository\`, execute \`git init\` no workspace antes de repetir o fluxo Git.
- Se \`git commit\` falhar com \`not a git repository\`, execute \`git init\`, confirme com \`git status\` e repita exatamente o mesmo \`git add\` e \`git commit\` uma única vez.
- Não aplique este fallback para outros erros de commit; reporte a causa real.
`;
}
