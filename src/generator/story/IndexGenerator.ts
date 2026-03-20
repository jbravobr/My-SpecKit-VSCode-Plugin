import { Story } from '../../story/Story';

export function generateIndex(story: Story): string {
  return `# SpecKit — Copilot Instructions Index

Story: **${story.metadata.title || story.metadata.id}**
Stack: ${story.technicalSpec.language} / ${story.technicalSpec.framework} / ${story.technicalSpec.architecture}

## Active Instructions

### Baseline (always applied)
- \`instructions/00-agent-integrity\` — agent behavior + delivery gate (tests required)
- \`instructions/01-performance\` — algorithmic efficiency
- \`instructions/02-architecture\` — design & structure
- \`instructions/03-context-management\` — anti-hallucination
- \`instructions/04-testing-standards\` — coverage ≥ 80%, mandatory scenarios
- \`instructions/05-git-workflow\` — gitflow + conventional commits

### Language & Framework
- \`instructions/lang-${story.technicalSpec.language}\` — language conventions
- \`instructions/fw-${story.technicalSpec.framework}\` — framework patterns

### Story Context
- \`instructions/10-business-context\` — business requirement
- \`instructions/11-functional-spec\` — user stories & acceptance criteria
- \`instructions/12-nonfunctional-spec\` — performance, security, scalability
- \`instructions/13-tech-stack\` — stack & conventions
- \`instructions/14-architecture-pattern\` — architecture rules
- \`instructions/15-dod-checklist\` — definition of done

## Available Prompts
- \`prompts/implement.prompt.md\` — **Sessão A**: alinhamento + implementação + testes (portões 0–2) · acionado por \`/validate\` e \`/apply\`
- \`prompts/review.prompt.md\`    — **Sessão B**: revisão independente + entrega (portões 3–4) · acionado por \`/review\`
- \`prompts/run.prompt.md\`       — Modo monolítico (hotfixes, chores) · todos os portões em uma sessão
`;
}
