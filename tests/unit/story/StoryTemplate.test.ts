import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStory } from '../../../src/story/StoryParser';
import { generateStoryTemplate } from '../../../src/story/StoryTemplate';

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

  it("contains today's date", () => {
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

  it('contains gate and projectStage fields', () => {
    const template = generateStoryTemplate('001');
    expect(template).toContain('gate: 0');
    expect(template).toContain('### Estágio do Projeto');
    expect(template).toContain('greenfield | brownfield');
  });

  it('parses gate as 0 from generated template', () => {
    const template = generateStoryTemplate('001');
    const story = parseStory(template);
    expect(story.metadata.gate).toBe(0);
    expect(story.technicalSpec.projectStage).toBe('');
  });

  describe('with workspace defaults', () => {
    it('pre-fills tech spec when defaults are provided', () => {
      const template = generateStoryTemplate('001', {
        language: 'typescript',
        framework: 'react',
        architecture: 'hexagonal',
        target: 'frontend',
        projectStage: 'brownfield',
      });
      const story = parseStory(template);
      expect(story.technicalSpec.language).toBe('typescript');
      expect(story.technicalSpec.framework).toBe('react');
      expect(story.technicalSpec.architecture).toBe('hexagonal');
      expect(story.technicalSpec.target).toBe('frontend');
      expect(story.technicalSpec.projectStage).toBe('brownfield');
    });

    it('keeps TODO placeholders for unset defaults', () => {
      const template = generateStoryTemplate('001', { language: 'java' });
      const story = parseStory(template);
      expect(story.technicalSpec.language).toBe('java');
      expect(story.technicalSpec.framework).toBe('');
      expect(story.technicalSpec.architecture).toBe('');
    });

    it('pre-fills database and infrastructure', () => {
      const template = generateStoryTemplate('001', {
        database: 'PostgreSQL 15',
        infrastructure: 'AWS ECS',
      });
      const story = parseStory(template);
      expect(story.technicalSpec.database).toBe('PostgreSQL 15');
      expect(story.technicalSpec.infrastructure).toBe('AWS ECS');
    });

    it('uses empty defaults without changing template behavior', () => {
      const template = generateStoryTemplate('001', {});
      const story = parseStory(template);
      expect(story.technicalSpec.language).toBe('');
      expect(story.technicalSpec.framework).toBe('');
    });
  });
});
