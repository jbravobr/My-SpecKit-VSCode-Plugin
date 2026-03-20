import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { generateStoryTemplate } from '../../../src/story/StoryTemplate';
import { parseStory } from '../../../src/story/StoryParser';

describe('generateStoryTemplate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('contains the provided id', () => {
    const template = generateStoryTemplate('001');
    expect(template).toContain('id: 001');
    expect(template).toContain('# História 001');
  });

  it('contains today\'s date', () => {
    const template = generateStoryTemplate('042');
    expect(template).toContain('createdAt: 2026-03-20');
  });

  it('contains all required sections', () => {
    const template = generateStoryTemplate('001');
    expect(template).toContain('## Requisito de Negócio');
    expect(template).toContain('## Especificação Funcional');
    expect(template).toContain('## Especificação Não-Funcional');
    expect(template).toContain('## Especificação Técnica');
    expect(template).toContain('## DoR — Definition of Ready');
    expect(template).toContain('## DoD — Definition of Done');
  });

  it('is parseable by StoryParser without throwing', () => {
    const template = generateStoryTemplate('007');
    expect(() => parseStory(template)).not.toThrow();
  });

  it('parses to empty section fields (all TODOs)', () => {
    const template = generateStoryTemplate('001');
    const story = parseStory(template);
    expect(story.metadata.id).toBe('001');
    // title inside metadata comment block has nested comment — parser limitation
    expect(story.businessRequirement.problem).toBe('');
    expect(story.technicalSpec.language).toBe('');
    expect(story.functionalSpec.userStories).toHaveLength(0);
  });
});
