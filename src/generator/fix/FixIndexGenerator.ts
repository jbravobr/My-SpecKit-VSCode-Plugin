import { Fix } from '../../fix/Fix';
import { TechStackDetection } from '../../fix/Fix';

export function generateFixIndex(fix: Fix, stack: TechStackDetection): string {
  return `# SpecKit — Fix ${fix.metadata.id}: ${fix.metadata.title || '(sem título)'}

## Tipo: Bug Fix

**Severidade:** ${fix.impactAssessment.severity?.toUpperCase() || 'NÃO DEFINIDA'}
**Stack detectada:** ${stack.language} / ${stack.framework}${stack.architecture ? ` / ${stack.architecture}` : ''} (fonte: \`${stack.source}\`)

## Objetivo

Corrigir o bug descrito em \`.speckit/FIX-${fix.metadata.id}.md\`.

- A root cause deve ser confirmada **antes** de qualquer mudança de código
- Escopo estritamente limitado ao bug — zero mudanças fora do escopo
- Testes de regressão são obrigatórios

## Instruções carregadas

Todas as instruções em \`.github/instructions/\` são aplicadas automaticamente.
Use os prompts em \`.github/prompts/\` para conduzir o fluxo de implementação.
`;
}
