import { Fix } from '../../fix/Fix';

export function generateImpact(fix: Fix): string {
  const systems =
    fix.impactAssessment.affectedSystems.map((s) => `- ${s}`).join('\n') || '- (não especificado)';

  return `---
applyTo: '**'
---
# Impact Assessment — Fix ${fix.metadata.id}

## Severidade: ${fix.impactAssessment.severity?.toUpperCase() || 'NÃO ESPECIFICADA'}

## Usuários/Sistemas Afetados

${fix.impactAssessment.affectedUsers || '(não especificado)'}

## Sistemas Impactados

${systems}

## Risco de Regressão

${fix.impactAssessment.regressionRisk || '(não especificado)'}

## Diretrizes

- Priorize a correção de acordo com a severidade: **${fix.impactAssessment.severity || 'não definida'}**
- Faça mudanças cirúrgicas — não refatore código fora do escopo do bug
- Avalie o risco de regressão antes de alterar qualquer módulo adjacente
`;
}
