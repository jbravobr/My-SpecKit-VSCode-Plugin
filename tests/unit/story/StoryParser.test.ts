import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { parseStory } from '../../../src/story/StoryParser';

const fixturesDir = resolve(__dirname, '../../fixtures');
const completeStoryMd = readFileSync(resolve(fixturesDir, 'story-complete.md'), 'utf-8');
const emptyStoryMd = readFileSync(resolve(fixturesDir, 'story-empty.md'), 'utf-8');
const completeStoryH4Md = readFileSync(resolve(fixturesDir, 'story-complete-h4.md'), 'utf-8');

describe('parseStory', () => {
  it('parses a complete story correctly', () => {
    const story = parseStory(completeStoryMd);

    expect(story.metadata.id).toBe('001');
    expect(story.metadata.title).toBe('Autenticação via OAuth2 com GitHub');
    expect(story.metadata.createdAt).toBe('2026-01-15');
    expect(story.metadata.version).toBe(1);

    expect(story.businessRequirement.problem).toContain('fricção no onboarding');
    expect(story.businessRequirement.value).toContain('Login social via GitHub');
    expect(story.businessRequirement.stakeholders).toHaveLength(3);
    expect(story.businessRequirement.stakeholders[0]).toContain('Time de Produto');

    expect(story.functionalSpec.userStories).toHaveLength(2);
    expect(story.functionalSpec.acceptanceCriteria).toHaveLength(4);
    expect(story.functionalSpec.outOfScope).toHaveLength(2);

    expect(story.nonFunctionalSpec.performance).toContain('P99');
    expect(story.nonFunctionalSpec.security).toContain('HTTPS');

    expect(story.technicalSpec.language).toBe('typescript');
    expect(story.technicalSpec.framework).toBe('react');
    expect(story.technicalSpec.architecture).toBe('hexagonal');
    expect(story.technicalSpec.target).toBe('frontend');

    expect(story.dor.criteria).toHaveLength(7);
    expect(story.dor.checked).toHaveLength(7);
    expect(story.dor.checked.every((c) => c)).toBe(true);

    expect(story.dod.criteria).toHaveLength(5);
  });

  it('parses an empty story without throwing', () => {
    expect(() => parseStory(emptyStoryMd)).not.toThrow();
    const story = parseStory(emptyStoryMd);
    expect(story.metadata.id).toBe('001');
    // title inside metadata block has nested comment — not cleaned (parser limitation)
    expect(story.businessRequirement.problem).toBe('');
    expect(story.functionalSpec.userStories).toHaveLength(0);
    expect(story.functionalSpec.acceptanceCriteria).toHaveLength(0);
    expect(story.technicalSpec.language).toBe('');
    expect(story.technicalSpec.framework).toBe('');
    expect(story.dor.checked.every((c) => !c)).toBe(true);
  });

  it('cleanTodo removes TODO comments from section fields', () => {
    const story = parseStory(emptyStoryMd);
    // Sections use extractSection which strips HTML comments before cleanTodo
    expect(story.businessRequirement.problem).not.toContain('TODO');
    expect(story.technicalSpec.language).not.toContain('TODO');
    expect(story.nonFunctionalSpec.performance).not.toContain('TODO');
  });

  it('parses DoR checked/unchecked items correctly', () => {
    const story = parseStory(completeStoryMd);
    expect(story.dor.checked.every((c) => c)).toBe(true);

    const partialMd = readFileSync(resolve(fixturesDir, 'story-partial.md'), 'utf-8');
    const partial = parseStory(partialMd);
    expect(partial.dor.checked.every((c) => !c)).toBe(true);
  });

  it('extracts metadata fields correctly', () => {
    const story = parseStory(completeStoryMd);
    expect(story.metadata.version).toBe(1);
    expect(story.metadata.createdAt).toBe('2026-01-15');
  });

  // Regression: template uses ### for groups and #### for content fields.
  // The parser must handle h4 headings — previously only h2/h3 were recognised.
  describe('h4 heading format (output of StoryElicitGenerator)', () => {
    it('parses all content fields from #### headings', () => {
      const story = parseStory(completeStoryH4Md);

      expect(story.metadata.title).toBe('Autenticação via OAuth2 com GitHub');

      expect(story.businessRequirement.problem).toContain('fricção no onboarding');
      expect(story.businessRequirement.value).toContain('Login social via GitHub');
      expect(story.businessRequirement.stakeholders).toHaveLength(3);

      expect(story.functionalSpec.userStories).toHaveLength(2);
      expect(story.functionalSpec.acceptanceCriteria).toHaveLength(4);
      expect(story.functionalSpec.outOfScope).toHaveLength(2);

      expect(story.nonFunctionalSpec.performance).toContain('P99');
      expect(story.nonFunctionalSpec.security).toContain('HTTPS');

      expect(story.technicalSpec.language).toBe('typescript');
      expect(story.technicalSpec.framework).toBe('react');
      expect(story.technicalSpec.architecture).toBe('hexagonal');
      expect(story.technicalSpec.target).toBe('frontend');

      expect(story.dod.criteria).toHaveLength(5);
    });

    it('parses DoR items and checked state from #### format', () => {
      const story = parseStory(completeStoryH4Md);

      expect(story.dor.criteria).toHaveLength(7);
      expect(story.dor.checked).toHaveLength(7);
      // first 5 checked, last 2 unchecked (human-only criteria)
      expect(story.dor.checked.slice(0, 5).every((c) => c)).toBe(true);
      expect(story.dor.checked.slice(5).every((c) => !c)).toBe(true);
    });
  });

  describe('expanded metadata fields (gate, status, type, projectStage)', () => {
    it('defaults gate to 0 when not present in metadata', () => {
      const story = parseStory(completeStoryMd);
      expect(story.metadata.gate).toBe(0);
    });

    it('defaults status to open when not present', () => {
      const story = parseStory(completeStoryMd);
      expect(story.metadata.status).toBe('open');
    });

    it('defaults type to story when not present', () => {
      const story = parseStory(emptyStoryMd);
      expect(story.metadata.type).toBe('story');
    });

    it('defaults projectStage to empty when not present', () => {
      const story = parseStory(completeStoryMd);
      expect(story.technicalSpec.projectStage).toBe('');
    });

    it('parses gate from metadata block', () => {
      const md = completeStoryMd.replace('version: 1', 'version: 1\ngate: 2');
      const story = parseStory(md);
      expect(story.metadata.gate).toBe(2);
    });

    it('parses expanded status values', () => {
      for (const status of ['in-progress', 'review', 'blocked', 'cancelled'] as const) {
        const md = completeStoryMd.replace('version: 1', `version: 1\nstatus: ${status}`);
        const story = parseStory(md);
        expect(story.metadata.status).toBe(status);
      }
    });

    it('parses spec type refactoring and spike', () => {
      for (const type of ['refactoring', 'spike'] as const) {
        const md = completeStoryMd.replace('version: 1', `version: 1\ntype: ${type}`);
        const story = parseStory(md);
        expect(story.metadata.type).toBe(type);
      }
    });

    it('parses projectStage from section', () => {
      const md = completeStoryMd + '\n### Estágio do Projeto\ngreenfield\n';
      const story = parseStory(md);
      expect(story.technicalSpec.projectStage).toBe('greenfield');
    });

    it('clamps invalid gate values to 0', () => {
      const md = completeStoryMd.replace('version: 1', 'version: 1\ngate: 99');
      const story = parseStory(md);
      expect(story.metadata.gate).toBe(0);
    });

    it('treats unknown status as open', () => {
      const md = completeStoryMd.replace('version: 1', 'version: 1\nstatus: invalidvalue');
      const story = parseStory(md);
      expect(story.metadata.status).toBe('open');
    });
  });
});
