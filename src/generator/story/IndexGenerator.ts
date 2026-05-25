import { Story } from '../../story/Story';

export function generateIndex(
  story: Story,
  contextSkillName = 'speckit-story-context',
  graphBlock?: string,
): string {
  const base = `# SpecKit — Copilot Instructions

Story: **${story.metadata.title || story.metadata.id}**
Stack: ${story.technicalSpec.language} / ${story.technicalSpec.framework} / ${story.technicalSpec.architecture}

## Projeto gerenciado pelo SpecKit

Este workspace usa o SpecKit para governança de desenvolvimento.
A spec da story ativa está em \`.speckit/STORY-${story.metadata.id}.md\`.

## Skills (carregados sob demanda)
- \`skills/speckit-baseline\` — padrões de engenharia, testes, segurança, git
- \`skills/speckit-stack\` — convenções de ${story.technicalSpec.language}/${story.technicalSpec.framework}
- \`skills/${contextSkillName}\` — contexto de negócio e critérios da story

## Agents (selecione no dropdown)
- **speckit-implementador** — Sessão A: alinhamento → implementação → testes (Gates 0–2)
- **speckit-revisor** — Sessão B: revisão independente → entrega (Gates 3–4)

## Regras globais
- Leia a spec antes de qualquer ação de implementação
- Cobertura de testes ≥ 80% obrigatória
- Commits seguem Conventional Commits
`;

  return graphBlock === undefined || graphBlock.trim().length === 0
    ? base
    : `${base.trimEnd()}\n\n${graphBlock.trim()}\n`;
}
