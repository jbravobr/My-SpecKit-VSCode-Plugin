import type { Story } from '../../story/Story';

/**
 * Generates a multi-story `copilot-instructions.md` for batch mode.
 * Lists all active context skills and unified agents.
 */
export function generateBatchIndex(stories: Story[]): string {
  const activeStories = stories.filter(
    (s) => s.metadata.status !== 'done' && s.metadata.status !== 'cancelled',
  );

  const storyList = activeStories
    .map((s) => {
      const lang = s.technicalSpec.language || '—';
      const fw = s.technicalSpec.framework || '—';
      return `- **${s.metadata.title || s.metadata.id}** (\`${s.metadata.id}\`) — ${lang}/${fw} — Gate ${s.metadata.gate}`;
    })
    .join('\n');

  const skillsList = activeStories
    .map((s) => `- \`skills/speckit-context-STORY-${s.metadata.id}/SKILL.md\``)
    .join('\n');

  const agentsList = activeStories
    .map((s) => `- **speckit-story-${s.metadata.id}** — Gates 0-4 (implementação + revisão)`)
    .join('\n');

  return `# SpecKit — Copilot Instructions (Batch Mode)

> Instruções geradas automaticamente pelo SpecKit em modo batch.
> Cada story tem seu próprio agente unificado no dropdown de agentes.

## Stories ativas

${storyList || '- nenhuma'}

## Skills de contexto por story

${skillsList || '- nenhuma'}

## Skills compartilhadas

- \`skills/speckit-baseline/SKILL.md\` — guardrails universais
- \`skills/speckit-stack/SKILL.md\` — guardrails da stack detectada

## Agentes por story

${agentsList || '- nenhum'}

## Como usar

1. Abra um novo **Copilot Chat** (\`Ctrl+Alt+I\`)
2. No dropdown de agentes, selecione o agente da story desejada (ex: \`speckit-story-US-...\`)
3. O agente conduz o ciclo completo: implementação (Gates 0-2) + revisão (Gates 3-4)
4. Para stories independentes, abra abas de chat em paralelo

## Regras gerais

- Leia a spec da story **antes** de qualquer ação
- Respeite os gates — não pule etapas
- O revisor **nunca** implementa — apenas documenta e devolve ao implementador
- Dependências entre stories são verificadas no Gate 0

## Estratégia de branch (batch)

- Use **uma única branch** para todo o lote (ex: \`feature/batch-<yyyymmdd>-<slug>\`)
- Não crie \`feature/<story-id>-<slug>\` neste modo
- Não empilhe branch de uma story sobre outra
- Se a execução iniciar em \`develop\`/\`main\`, crie a branch do lote uma vez e reutilize até o fim
`;
}
