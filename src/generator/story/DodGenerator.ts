import { Story } from '../../story/Story';

export function generateDod(story: Story): string {
  const criteria = story.dod.criteria.map(c => `- [ ] ${c}`).join('\n');

  return `---
applyTo: "**"
---
# Definition of Done — Checklist Ativo

Toda implementação desta story DEVE atender:

${criteria || '- [ ] (critérios não definidos)'}

**Regra**: não considere nenhum item entregue enquanto este checklist não estiver completo.
`;
}
