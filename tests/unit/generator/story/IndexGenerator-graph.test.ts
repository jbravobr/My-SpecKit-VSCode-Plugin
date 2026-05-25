import { describe, expect, it } from 'vitest';
import { generateIndex } from '../../../../src/generator/story/IndexGenerator';
import { emptyStory } from '../../../../src/story/Story';

function story() {
  return {
    ...emptyStory(),
    metadata: { ...emptyStory().metadata, id: '001', title: 'Graph Embed' },
    technicalSpec: {
      ...emptyStory().technicalSpec,
      language: 'typescript' as const,
      framework: 'react' as const,
      architecture: 'hexagonal' as const,
    },
  };
}

describe('generateIndex graph block injection', () => {
  it('preserves current markdown when graphBlock is omitted', () => {
    const withoutGraph = generateIndex(story(), 'speckit-context-STORY-001');
    const explicitlyUndefined = generateIndex(story(), 'speckit-context-STORY-001', undefined);

    expect(explicitlyUndefined).toBe(withoutGraph);
    expect(withoutGraph).not.toContain('## GRAPH CONTEXT');
  });

  it('appends graphBlock as the final section', () => {
    const graphBlock =
      '## GRAPH CONTEXT (.speckit/graph.json @ abcdef1)\n\n- `src/app.ts` — fanIn=0 fanOut=1\n';
    const markdown = generateIndex(story(), 'speckit-context-STORY-001', graphBlock);

    expect(markdown).toContain(graphBlock.trim());
    expect(markdown.trimEnd().endsWith(graphBlock.trim())).toBe(true);
  });
});
