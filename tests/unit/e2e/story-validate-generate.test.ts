import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseStory } from '../../../src/story/StoryParser';
import { validateStory } from '../../../src/story/StoryValidator';
import { generateCopilotConfig } from '../../../src/generator/CopilotConfigGenerator';
import { InMemoryFileSystem } from '../../support/fakes';

const fixturesDir = resolve(__dirname, '../../fixtures');

function loadFixture(filename: string): string {
  return readFileSync(resolve(fixturesDir, filename), 'utf-8');
}

describe('story → validate → generate (E2E)', () => {
  describe('java + springboot + kafka + aurora (story-java-kafka-aws.md)', () => {
    it('parses correct tech stack', () => {
      const story = parseStory(loadFixture('story-java-kafka-aws.md'));
      expect(story.technicalSpec.language).toBe('java');
      expect(story.technicalSpec.framework).toBe('springboot');
      expect(story.technicalSpec.architecture).toBe('hexagonal');
      expect(story.technicalSpec.target).toBe('backend');
      expect(story.technicalSpec.infrastructure).toContain('Kafka');
      expect(story.technicalSpec.database).toContain('Aurora');
    });

    it('validates as DoR ready', () => {
      const story = parseStory(loadFixture('story-java-kafka-aws.md'));
      const result = validateStory(story);
      expect(result.valid).toBe(true);
      expect(result.gaps).toHaveLength(0);
    });

    it('generates correct files and omits unrelated ones', async () => {
      const story = parseStory(loadFixture('story-java-kafka-aws.md'));
      const fs = new InMemoryFileSystem();
      await generateCopilotConfig('/workspace', story, fs);

      // Required
      expect(fs.hasFile('copilot-instructions.md')).toBe(true);
      expect(fs.hasFile('lang-java.instructions.md')).toBe(true);
      expect(fs.hasFile('fw-springboot.instructions.md')).toBe(true);
      expect(fs.hasFile('infra-kafka.instructions.md')).toBe(true);
      expect(fs.hasFile('infra-aws.instructions.md')).toBe(true);
      expect(fs.hasFile('pattern-crud.instructions.md')).toBe(true);
      expect(fs.hasFile('implement.prompt.md')).toBe(true);
      expect(fs.hasFile('review.prompt.md')).toBe(true);

      // New baseline files always written
      expect(fs.hasFile('06-credential-security.instructions.md')).toBe(true);
      expect(fs.hasFile('07-observability.instructions.md')).toBe(true);
      expect(fs.hasFile('08-security-tests.instructions.md')).toBe(true);

      // Must NOT be generated
      expect(fs.hasFile('pattern-bff.instructions.md')).toBe(false);
      expect(fs.hasFile('infra-glue.instructions.md')).toBe(false);
      expect(fs.hasFile('pattern-contract-testing.instructions.md')).toBe(false);
    });
  });

  describe('java + springboot + bff (story-bff.md)', () => {
    it('parses as bff target', () => {
      const story = parseStory(loadFixture('story-bff.md'));
      expect(story.technicalSpec.target).toBe('bff');
      expect(story.technicalSpec.language).toBe('java');
    });

    it('validates as DoR ready', () => {
      const story = parseStory(loadFixture('story-bff.md'));
      const result = validateStory(story);
      expect(result.valid).toBe(true);
      expect(result.gaps).toHaveLength(0);
    });

    it('generates BFF and CRUD patterns but not kafka, aws or glue', async () => {
      const story = parseStory(loadFixture('story-bff.md'));
      const fs = new InMemoryFileSystem();
      await generateCopilotConfig('/workspace', story, fs);

      expect(fs.hasFile('pattern-bff.instructions.md')).toBe(true);
      expect(fs.hasFile('pattern-crud.instructions.md')).toBe(true);
      expect(fs.hasFile('pattern-contract-testing.instructions.md')).toBe(true);
      expect(fs.hasFile('lang-java.instructions.md')).toBe(true);
      expect(fs.hasFile('fw-springboot.instructions.md')).toBe(true);

      // New baseline files always written
      expect(fs.hasFile('06-credential-security.instructions.md')).toBe(true);
      expect(fs.hasFile('07-observability.instructions.md')).toBe(true);
      expect(fs.hasFile('08-security-tests.instructions.md')).toBe(true);

      expect(fs.hasFile('infra-kafka.instructions.md')).toBe(false);
      expect(fs.hasFile('infra-aws.instructions.md')).toBe(false);
      expect(fs.hasFile('infra-glue.instructions.md')).toBe(false);
    });
  });

  describe('python + glue + s3 (story-glue.md)', () => {
    it('parses as python script target', () => {
      const story = parseStory(loadFixture('story-glue.md'));
      expect(story.technicalSpec.language).toBe('python');
      expect(story.technicalSpec.target).toBe('script');
      expect(story.technicalSpec.infrastructure).toContain('Glue');
    });

    it('validates as DoR ready', () => {
      const story = parseStory(loadFixture('story-glue.md'));
      const result = validateStory(story);
      expect(result.valid).toBe(true);
      expect(result.gaps).toHaveLength(0);
    });

    it('generates glue and python but not kafka, aws, bff or crud patterns', async () => {
      const story = parseStory(loadFixture('story-glue.md'));
      const fs = new InMemoryFileSystem();
      await generateCopilotConfig('/workspace', story, fs);

      expect(fs.hasFile('infra-glue.instructions.md')).toBe(true);
      expect(fs.hasFile('lang-python.instructions.md')).toBe(true);

      // New baseline files always written
      expect(fs.hasFile('06-credential-security.instructions.md')).toBe(true);
      expect(fs.hasFile('07-observability.instructions.md')).toBe(true);
      expect(fs.hasFile('08-security-tests.instructions.md')).toBe(true);

      expect(fs.hasFile('infra-kafka.instructions.md')).toBe(false);
      expect(fs.hasFile('infra-aws.instructions.md')).toBe(false);
      expect(fs.hasFile('pattern-bff.instructions.md')).toBe(false);
      expect(fs.hasFile('pattern-crud.instructions.md')).toBe(false);
      expect(fs.hasFile('pattern-contract-testing.instructions.md')).toBe(false);
    });
  });
});
