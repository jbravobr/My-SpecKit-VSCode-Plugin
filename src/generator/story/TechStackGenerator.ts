import { Story } from '../../story/Story';

export function generateTechStack(story: Story): string {
  return `---
applyTo: "**"
---
# Tech Stack — Especificação Técnica

## Linguagem
${story.technicalSpec.language || '(não especificado)'}

## Framework
${story.technicalSpec.framework || '(não especificado)'}

## Arquitetura
${story.technicalSpec.architecture || '(não especificado)'}

## Target
${story.technicalSpec.target || '(não especificado)'}

## Banco de Dados
${story.technicalSpec.database || '(não especificado)'}

## Infraestrutura
${story.technicalSpec.infrastructure || '(não especificado)'}
`;
}
