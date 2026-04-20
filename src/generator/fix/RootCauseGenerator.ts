import { Fix } from '../../fix/Fix';

export function generateRootCause(fix: Fix): string {
  const suspectedFiles =
    fix.rootCauseHypothesis.suspectedFiles.map((f) => `- ${f}`).join('\n') ||
    '- (não especificado)';

  return `---
applyTo: '**'
---
# Root Cause Analysis — Fix ${fix.metadata.id}

## Hipótese da Causa Raiz

${fix.rootCauseHypothesis.hypothesis || '(não especificado)'}

## Arquivos/Componentes Suspeitos

${suspectedFiles}

## Diretrizes para Investigação

- Leia os arquivos suspeitos na íntegra antes de propor qualquer mudança
- Use \`git log --follow -p <arquivo>\` para entender o histórico de mudanças
- Use \`git blame\` para identificar quando e por quem cada linha foi introduzida
- Confirme a root cause **antes** de escrever qualquer código
- Escopo mínimo: corrija apenas o que causa o bug descrito
`;
}
