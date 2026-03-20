import { Story } from '../../story/Story';

export function generateNonFunctional(story: Story): string {
  return `---
applyTo: "**"
---
# Non-Functional Spec — Requisitos Não-Funcionais

## Performance
${story.nonFunctionalSpec.performance || '(não especificado)'}

## Segurança
${story.nonFunctionalSpec.security || '(não especificado)'}

## Escalabilidade
${story.nonFunctionalSpec.scalability || '(não especificado)'}

## Usabilidade
${story.nonFunctionalSpec.usability || '(não especificado)'}

## Disponibilidade
${story.nonFunctionalSpec.availability || '(não especificado)'}
`;
}
