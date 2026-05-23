import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { generateCopilotConfig } from '../../../../src/generator/CopilotConfigGenerator';
import { parseStory } from '../../../../src/story/StoryParser';
import { InMemoryFileSystem } from '../../../support/fakes';

const fixturesDir = resolve(__dirname, '../../../fixtures');

function loadStory(filename: string) {
  return parseStory(readFileSync(resolve(fixturesDir, filename), 'utf-8'));
}

const root = '/fake-workspace';

describe('Corp-* skills regression — no impact on existing flow', () => {
  it('story-complete.md (neutral stack: typescript+react, no aws/mongo/kafka) generates corp universal pair only', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    // baseline/stack/context unchanged
    expect(fs.hasFile('speckit-baseline/SKILL.md')).toBe(true);
    expect(fs.hasFile('speckit-stack/SKILL.md')).toBe(true);
    expect(fs.hasFile('speckit-context-STORY-001/SKILL.md')).toBe(true);
    // corp universal pair always present
    expect(fs.hasFile('corp-naming-conventions/SKILL.md')).toBe(true);
    expect(fs.hasFile('corp-http-integration/SKILL.md')).toBe(true);
    // none of the stack-gated corp skills
    expect(fs.hasFile('corp-spring-scheduled/SKILL.md')).toBe(false);
    expect(fs.hasFile('corp-aws-secrets/SKILL.md')).toBe(false);
    expect(fs.hasFile('corp-mongo/SKILL.md')).toBe(false);
    expect(fs.hasFile('corp-kafka/SKILL.md')).toBe(false);
    expect(fs.hasFile('corp-rabbitmq-listener/SKILL.md')).toBe(false);
  });

  it('story-java-kafka-aws.md generates Spring + AWS + Kafka corp skills', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.hasFile('corp-spring-scheduled/SKILL.md')).toBe(true);
    expect(fs.hasFile('corp-spring-config/SKILL.md')).toBe(true);
    expect(fs.hasFile('corp-spring-rest/SKILL.md')).toBe(true);
    expect(fs.hasFile('corp-aws-secrets/SKILL.md')).toBe(true);
    expect(fs.hasFile('corp-aws-credentials/SKILL.md')).toBe(true);
    expect(fs.hasFile('corp-kafka/SKILL.md')).toBe(true);
    expect(fs.hasFile('corp-kafka-spring/SKILL.md')).toBe(true);
  });

  it('existing speckit-* skill content is unchanged (no corp pollution in baseline/stack)', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    const baseline = fs.contentFor('speckit-baseline/SKILL.md')!;
    const stack = fs.contentFor('speckit-stack/SKILL.md')!;
    expect(baseline).not.toContain('corp-');
    expect(stack).not.toContain('corp-');
  });

  it('returned paths still use forward slashes only', async () => {
    const fs = new InMemoryFileSystem();
    const files = await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(files.every((f) => !f.includes('\\'))).toBe(true);
  });
});
