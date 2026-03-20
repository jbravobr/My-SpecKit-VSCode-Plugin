import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseStory } from '../../../../src/story/StoryParser';
import { emptyStory } from '../../../../src/story/Story';
import {
  generateImplementPrompt,
  generateReviewPrompt,
  generateRunPrompt,
  generateGapFillingPrompt,
} from '../../../../src/generator/story/PromptsGenerator';

const fixturesDir = resolve(__dirname, '../../../fixtures');
const completeStoryMd = readFileSync(resolve(fixturesDir, 'story-complete.md'), 'utf-8');
const completeStory = parseStory(completeStoryMd);

describe('PromptsGenerator', () => {
  describe('generateImplementPrompt', () => {
    it('contains story title', () => {
      const result = generateImplementPrompt(completeStory);
      expect(result).toContain('Autenticação via OAuth2 com GitHub');
    });

    it('contains tech stack', () => {
      const result = generateImplementPrompt(completeStory);
      expect(result).toContain('typescript');
      expect(result).toContain('react');
      expect(result).toContain('hexagonal');
    });

    it('does not throw for empty story', () => {
      expect(() => generateImplementPrompt(emptyStory())).not.toThrow();
    });
  });

  describe('generateReviewPrompt', () => {
    it('contains story data', () => {
      const result = generateReviewPrompt(completeStory);
      expect(result.length).toBeGreaterThan(0);
    });

    it('does not throw for empty story', () => {
      expect(() => generateReviewPrompt(emptyStory())).not.toThrow();
    });
  });

  describe('generateRunPrompt', () => {
    it('contains story data', () => {
      const result = generateRunPrompt(completeStory);
      expect(result.length).toBeGreaterThan(0);
    });

    it('does not throw for empty story', () => {
      expect(() => generateRunPrompt(emptyStory())).not.toThrow();
    });
  });

  describe('generateGapFillingPrompt', () => {
    it('contains gap information', () => {
      const gaps = [{ section: 'Metadata', field: 'title', message: 'Título obrigatório' }];
      const result = generateGapFillingPrompt(completeStory, gaps);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
