import { Story } from '../../story/Story';

export function generateBusinessContext(story: Story): string {
  const stakeholders = story.businessRequirement.stakeholders.map((s) => `- ${s}`).join('\n');
  return `---
applyTo: "**"
---
# Business Context — Contexto de Negócio

## Problema
${story.businessRequirement.problem}

## Valor Entregue
${story.businessRequirement.value}

## Stakeholders
${stakeholders || '- (não especificado)'}
`;
}
