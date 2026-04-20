import { Story } from '../../story/Story';

export function generateFunctionalSpec(story: Story): string {
  const userStories = story.functionalSpec.userStories.map((s) => `- ${s}`).join('\n');
  const criteria = story.functionalSpec.acceptanceCriteria.map((c) => `- ${c}`).join('\n');
  const outOfScope = story.functionalSpec.outOfScope.map((o) => `- ${o}`).join('\n');

  return `---
applyTo: "**"
---
# Functional Spec — Especificação Funcional

## User Stories
${userStories || '- (não especificado)'}

## Critérios de Aceite
${criteria || '- (não especificado)'}

## Fora de Escopo
${outOfScope || '- (não especificado)'}
`;
}
