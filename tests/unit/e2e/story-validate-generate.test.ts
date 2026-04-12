import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { generateCopilotConfig } from '../../../src/generator/CopilotConfigGenerator';
import { parseStory } from '../../../src/story/StoryParser';
import { validateStory } from '../../../src/story/StoryValidator';
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

    it('generates correct skills and agents, omits unrelated content', async () => {
      const story = parseStory(loadFixture('story-java-kafka-aws.md'));
      const fs = new InMemoryFileSystem();
      await generateCopilotConfig('/workspace', story, fs);

      // Required structure
      expect(fs.hasFile('copilot-instructions.md')).toBe(true);
      expect(fs.hasFile('speckit-baseline/SKILL.md')).toBe(true);
      expect(fs.hasFile('speckit-stack/SKILL.md')).toBe(true);
      expect(fs.hasFile('speckit-context-STORY-002/SKILL.md')).toBe(true);
      expect(fs.hasFile('speckit-implementador.agent.md')).toBe(true);
      expect(fs.hasFile('speckit-revisor.agent.md')).toBe(true);

      // Stack skill contains Java, Spring Boot, Kafka, AWS
      const stackContent = fs.contentFor('speckit-stack/SKILL.md')!;
      expect(stackContent).toContain('Java');
      expect(stackContent).toContain('Spring Boot');
      expect(stackContent).toContain('Kafka');
      expect(stackContent).toContain('AWS');
      expect(stackContent).toContain('CRUD');

      // Must NOT contain BFF/Glue/Contract content
      expect(stackContent).not.toContain('Backend for Frontend');
      expect(stackContent).not.toContain('GlueJob');
      expect(stackContent).not.toContain('Pact');
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

    it('generates BFF and CRUD patterns in stack skill but not kafka, aws or glue', async () => {
      const story = parseStory(loadFixture('story-bff.md'));
      const fs = new InMemoryFileSystem();
      await generateCopilotConfig('/workspace', story, fs);

      const stackContent = fs.contentFor('speckit-stack/SKILL.md')!;
      expect(stackContent).toContain('BFF');
      expect(stackContent).toContain('CRUD');
      expect(stackContent).toContain('Contract');
      expect(stackContent).toContain('Java');
      expect(stackContent).toContain('Spring Boot');

      // Baseline skill always written
      expect(fs.hasFile('speckit-baseline/SKILL.md')).toBe(true);
      const baselineContent = fs.contentFor('speckit-baseline/SKILL.md')!;
      expect(baselineContent).toContain('IAM roles');
      expect(baselineContent).toContain('traceId');
      expect(baselineContent).toContain('401');

      // Must NOT contain dedicated Kafka/AWS/Glue sections
      expect(stackContent).not.toContain('# Kafka — Boas Práticas');
      expect(stackContent).not.toContain('## DynamoDB');
      expect(stackContent).not.toContain('GlueJob');
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

    it('generates glue and python in stack skill but not kafka, aws, bff or crud patterns', async () => {
      const story = parseStory(loadFixture('story-glue.md'));
      const fs = new InMemoryFileSystem();
      await generateCopilotConfig('/workspace', story, fs);

      const stackContent = fs.contentFor('speckit-stack/SKILL.md')!;
      expect(stackContent).toContain('Glue');
      expect(stackContent).toContain('Python');

      // Baseline skill always written
      expect(fs.hasFile('speckit-baseline/SKILL.md')).toBe(true);

      // Must NOT contain dedicated Kafka/AWS/BFF/CRUD sections
      expect(stackContent).not.toContain('# Kafka — Boas Práticas');
      expect(stackContent).not.toContain('## DynamoDB');
      expect(stackContent).not.toContain('Backend for Frontend');
      expect(stackContent).not.toContain('CRUD');
      expect(stackContent).not.toContain('Pact');
    });
  });
});
