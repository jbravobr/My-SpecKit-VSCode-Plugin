import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseStory } from '../../../src/story/StoryParser';
import { validateStory } from '../../../src/story/StoryValidator';
import { emptyStory } from '../../../src/story/Story';

const fixturesDir = resolve(__dirname, '../../fixtures');
const completeStoryMd = readFileSync(resolve(fixturesDir, 'story-complete.md'), 'utf-8');
const partialStoryMd = readFileSync(resolve(fixturesDir, 'story-partial.md'), 'utf-8');

describe('validateStory', () => {
  it('returns valid:true for a complete story', () => {
    const story = parseStory(completeStoryMd);
    const result = validateStory(story);
    expect(result.valid).toBe(true);
    expect(result.gaps).toHaveLength(0);
  });

  it('returns dorStatus for each criterion', () => {
    const story = parseStory(completeStoryMd);
    const result = validateStory(story);
    expect(result.dorStatus).toHaveLength(7);
    expect(result.dorStatus.every(d => d.checked)).toBe(true);
  });

  it('generates gap for missing title', () => {
    const story = emptyStory();
    story.businessRequirement.problem = 'some problem';
    story.businessRequirement.value = 'some value';
    story.businessRequirement.stakeholders = ['stakeholder'];
    story.functionalSpec.userStories = ['user story'];
    story.functionalSpec.acceptanceCriteria = ['criterion'];
    story.nonFunctionalSpec.performance = 'p99';
    story.nonFunctionalSpec.security = 'https';
    story.technicalSpec.language = 'typescript';
    story.technicalSpec.framework = 'react';
    story.technicalSpec.architecture = 'hexagonal';
    story.dod.criteria = ['criterion'];
    story.dor.criteria = ['item'];
    story.dor.checked = [true];

    const result = validateStory(story);
    const titleGap = result.gaps.find(g => g.field === 'title');
    expect(titleGap).toBeDefined();
    expect(titleGap?.section).toBe('Metadata');
  });

  it('generates gap for missing problem', () => {
    const story = parseStory(completeStoryMd);
    story.businessRequirement.problem = '';
    const result = validateStory(story);
    expect(result.gaps.some(g => g.field === 'problem')).toBe(true);
  });

  it('generates gap for missing acceptanceCriteria', () => {
    const story = parseStory(partialStoryMd);
    const result = validateStory(story);
    expect(result.gaps.some(g => g.field === 'acceptanceCriteria')).toBe(true);
  });

  it('generates gap for missing language', () => {
    const story = parseStory(completeStoryMd);
    story.technicalSpec.language = '';
    const result = validateStory(story);
    expect(result.gaps.some(g => g.field === 'language')).toBe(true);
  });

  it('generates gap for missing framework', () => {
    const story = parseStory(completeStoryMd);
    story.technicalSpec.framework = '';
    const result = validateStory(story);
    expect(result.gaps.some(g => g.field === 'framework')).toBe(true);
  });

  it('generates gap for missing architecture', () => {
    const story = parseStory(completeStoryMd);
    story.technicalSpec.architecture = '';
    const result = validateStory(story);
    expect(result.gaps.some(g => g.field === 'architecture')).toBe(true);
  });

  it('generates gap for unchecked DoR items', () => {
    const story = parseStory(partialStoryMd);
    const result = validateStory(story);
    expect(result.gaps.some(g => g.field === 'checked' && g.section === 'DoR')).toBe(true);
  });

  it('returns invalid for partial story', () => {
    const story = parseStory(partialStoryMd);
    const result = validateStory(story);
    expect(result.valid).toBe(false);
    expect(result.gaps.length).toBeGreaterThan(0);
  });
});
