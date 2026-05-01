import { describe, expect, it } from 'vitest';
import { generateBatchIndex } from '../../../../src/generator/story/BatchIndexGenerator';
import { emptyStory, type Story } from '../../../../src/story/Story';

function makeStory(overrides: {
  id: string;
  title?: string;
  status?: string;
  gate?: 0 | 1 | 2 | 3 | 4;
  language?: string;
  framework?: string;
}): Story {
  const s = emptyStory();
  s.metadata.id = overrides.id;
  s.metadata.title = overrides.title ?? `Story ${overrides.id}`;
  s.metadata.status = (overrides.status ?? 'open') as Story['metadata']['status'];
  s.metadata.gate = overrides.gate ?? 0;
  s.technicalSpec.language = (overrides.language ??
    'typescript') as Story['technicalSpec']['language'];
  s.technicalSpec.framework = (overrides.framework ??
    'react') as Story['technicalSpec']['framework'];
  return s;
}

describe('generateBatchIndex', () => {
  it('lists active stories in the output', () => {
    const stories = [
      makeStory({ id: '001', title: 'Auth OAuth2' }),
      makeStory({ id: '002', title: 'Dashboard vendas' }),
    ];
    const result = generateBatchIndex(stories);

    expect(result).toContain('Auth OAuth2');
    expect(result).toContain('Dashboard vendas');
    expect(result).toContain('001');
    expect(result).toContain('002');
  });

  it('excludes done and cancelled stories', () => {
    const stories = [
      makeStory({ id: '001', title: 'Active', status: 'open' }),
      makeStory({ id: '002', title: 'Finished', status: 'done' }),
      makeStory({ id: '003', title: 'Cancelled', status: 'cancelled' }),
    ];
    const result = generateBatchIndex(stories);

    expect(result).toContain('Active');
    expect(result).not.toContain('Finished');
    expect(result).not.toContain('Cancelled');
  });

  it('includes skill references per active story', () => {
    const stories = [makeStory({ id: '001' })];
    const result = generateBatchIndex(stories);

    expect(result).toContain('speckit-context-STORY-001');
  });

  it('includes agent references per active story', () => {
    const stories = [makeStory({ id: '001' })];
    const result = generateBatchIndex(stories);

    expect(result).toContain('speckit-story-001');
  });

  it('shows stack info in story list', () => {
    const stories = [makeStory({ id: '001', language: 'java', framework: 'springboot' })];
    const result = generateBatchIndex(stories);

    expect(result).toContain('java/springboot');
  });

  it('shows gate number in story list', () => {
    const stories = [makeStory({ id: '001', gate: 2 })];
    const result = generateBatchIndex(stories);

    expect(result).toContain('Gate 2');
  });

  it('shows "nenhuma" when no active stories', () => {
    const stories = [makeStory({ id: '001', status: 'done' })];
    const result = generateBatchIndex(stories);

    expect(result).toContain('nenhuma');
  });

  it('contains shared skill references', () => {
    const stories = [makeStory({ id: '001' })];
    const result = generateBatchIndex(stories);

    expect(result).toContain('speckit-baseline');
    expect(result).toContain('speckit-stack');
  });

  it('contains usage instructions', () => {
    const stories = [makeStory({ id: '001' })];
    const result = generateBatchIndex(stories);

    expect(result).toContain('Copilot Chat');
    expect(result).toContain('dropdown');
  });

  it('contains single-branch guidance for batch mode', () => {
    const stories = [makeStory({ id: '001' })];
    const result = generateBatchIndex(stories);

    expect(result).toContain('Estratégia de branch (batch)');
    expect(result).toContain('Use **uma única branch** para todo o lote');
    expect(result).toContain('Não crie `feature/<story-id>-<slug>` neste modo');
    expect(result).toContain('Não empilhe branch de uma story sobre outra');
  });
});
