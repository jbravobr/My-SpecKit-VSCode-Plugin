import { Fix } from '../../fix/Fix';

export function generateFixDof(fix: Fix): string {
  const criteria = fix.dof.criteria.map(c => `- [ ] ${c}`).join('\n') || '- [ ] (critérios não definidos)';

  return `---
applyTo: '**'
---
# DoF — Definition of Fixed — Fix ${fix.metadata.id}

## Critérios de Conclusão

${criteria}

## Condição de Encerramento

Todos os critérios acima devem estar marcados antes de declarar o fix como concluído.
O agente deve validar cada item explicitamente e não presumir que está satisfeito.
`;
}
