import { Fix } from '../../fix/Fix';

export function generateRegression(fix: Fix): string {
  const tests =
    fix.regressionPrevention.testsToAdd.map((t) => `- [ ] ${t}`).join('\n') ||
    '- [ ] (nenhum teste especificado)';

  return `---
applyTo: '**'
---
# Regression Prevention — Fix ${fix.metadata.id}

## Testes de Regressão Obrigatórios

${tests}

## Regras

- O cenário que causou o bug **deve** ter um teste explícito que falharia antes do fix
- Cada teste deve ser nomeado de forma a deixar claro qual bug ele previne
- Cobertura mínima: ≥ 80% nas linhas modificadas pelo fix
- Estrutura AAA obrigatória: Arrange → Act → Assert
- Sem mocks de lógica de domínio — mocke apenas dependências externas reais
`;
}
