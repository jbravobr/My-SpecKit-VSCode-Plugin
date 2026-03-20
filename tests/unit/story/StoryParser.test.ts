import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseStory } from '../../../src/story/StoryParser';

const fixturesDir = resolve(__dirname, '../../fixtures');
const completeStoryMd = readFileSync(resolve(fixturesDir, 'story-complete.md'), 'utf-8');
const emptyStoryMd = readFileSync(resolve(fixturesDir, 'story-empty.md'), 'utf-8');

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
    expect(story.dor.checked.every(c => c)).toBe(true);

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
    expect(story.dor.checked.every(c => !c)).toBe(true);
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
    expect(story.dor.checked.every(c => c)).toBe(true);

    const partialMd = readFileSync(resolve(fixturesDir, 'story-partial.md'), 'utf-8');
    const partial = parseStory(partialMd);
    expect(partial.dor.checked.every(c => !c)).toBe(true);
  });

  it('extracts metadata fields correctly', () => {
    const story = parseStory(completeStoryMd);
    expect(story.metadata.version).toBe(1);
    expect(story.metadata.createdAt).toBe('2026-01-15');
  });
});
