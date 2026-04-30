import { describe, expect, it } from 'vitest';
import { analyzeDependencies } from '../../../../src/generator/utils/DependencyGraph';
import { emptyStory, type Story } from '../../../../src/story/Story';

function makeStory(overrides: { id: string; status?: string; dependsOn?: string[] }): Story {
  const s = emptyStory();
  s.metadata.id = overrides.id;
  s.metadata.status = (overrides.status ?? 'open') as Story['metadata']['status'];
  s.metadata.dependsOn = overrides.dependsOn ?? [];
  return s;
}

describe('analyzeDependencies', () => {
  it('marks stories with no dependencies as independent', () => {
    const stories = [makeStory({ id: 'A' }), makeStory({ id: 'B' })];
    const result = analyzeDependencies(stories);

    expect(result.independent).toEqual(['A', 'B']);
    expect(result.blocked.size).toBe(0);
  });

  it('marks a story as blocked when its dependency is not done', () => {
    const stories = [
      makeStory({ id: 'A', status: 'open' }),
      makeStory({ id: 'B', status: 'open', dependsOn: ['A'] }),
    ];
    const result = analyzeDependencies(stories);

    expect(result.independent).toEqual(['A']);
    expect(result.blocked.get('B')).toEqual(['A']);
  });

  it('unblocks a story when all dependencies are done', () => {
    const stories = [
      makeStory({ id: 'A', status: 'done' }),
      makeStory({ id: 'B', status: 'open', dependsOn: ['A'] }),
    ];
    const result = analyzeDependencies(stories);

    expect(result.independent).toEqual(['B']);
    expect(result.blocked.size).toBe(0);
  });

  it('excludes done and cancelled stories from analysis', () => {
    const stories = [
      makeStory({ id: 'A', status: 'done' }),
      makeStory({ id: 'B', status: 'cancelled' }),
      makeStory({ id: 'C', status: 'open' }),
    ];
    const result = analyzeDependencies(stories);

    expect(result.independent).toEqual(['C']);
    expect(result.blocked.size).toBe(0);
  });

  it('handles transitive dependencies — only direct deps are evaluated', () => {
    const stories = [
      makeStory({ id: 'A', status: 'open' }),
      makeStory({ id: 'B', status: 'open', dependsOn: ['A'] }),
      makeStory({ id: 'C', status: 'open', dependsOn: ['B'] }),
    ];
    const result = analyzeDependencies(stories);

    expect(result.independent).toEqual(['A']);
    expect(result.blocked.get('B')).toEqual(['A']);
    expect(result.blocked.get('C')).toEqual(['B']);
  });

  it('handles external dependency not in the stories list', () => {
    const stories = [makeStory({ id: 'A', status: 'open', dependsOn: ['EXTERNAL-001'] })];
    const result = analyzeDependencies(stories);

    // External dep has no status in map → treated as not done → blocked
    expect(result.independent).toHaveLength(0);
    expect(result.blocked.get('A')).toEqual(['EXTERNAL-001']);
  });

  it('handles multiple dependencies — blocks if any is pending', () => {
    const stories = [
      makeStory({ id: 'A', status: 'done' }),
      makeStory({ id: 'B', status: 'open' }),
      makeStory({ id: 'C', status: 'open', dependsOn: ['A', 'B'] }),
    ];
    const result = analyzeDependencies(stories);

    expect(result.blocked.get('C')).toEqual(['B']);
  });

  it('returns empty results for empty input', () => {
    const result = analyzeDependencies([]);
    expect(result.independent).toEqual([]);
    expect(result.blocked.size).toBe(0);
  });
});
