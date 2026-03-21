import { Fix } from '../../fix/Fix';

export function generateFixContext(fix: Fix): string {
  const steps = fix.bugDescription.stepsToReproduce.map(s => `- ${s}`).join('\n') || '- (não especificado)';

  return `---
applyTo: '**'
---
# Fix Context — ${fix.metadata.id}: ${fix.metadata.title || '(sem título)'}

## Descrição do Bug

**Título:** ${fix.bugDescription.title || '(não especificado)'}

**Sintomas:** ${fix.bugDescription.symptoms || '(não especificado)'}

**Passos para Reproduzir:**
${steps}

**Ambiente:** ${fix.bugDescription.environment || '(não especificado)'}

**Frequência:** ${fix.bugDescription.frequency || '(não especificado)'}

---

## Root Cause Hypothesis

**Hipótese:** ${fix.rootCauseHypothesis.hypothesis || '(não especificado)'}

${fix.rootCauseHypothesis.suspectedFiles.length > 0
  ? `**Arquivos/Componentes Suspeitos:**\n${fix.rootCauseHypothesis.suspectedFiles.map(f => `- ${f}`).join('\n')}`
  : ''}
`;
}
