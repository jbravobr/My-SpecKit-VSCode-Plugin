import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseStory } from '../../../../src/story/StoryParser';
import { generateCiQualityGate, generateCiSecurityScan } from '../../../../src/generator/ci/CiGenerator';

const fixturesDir = resolve(__dirname, '../../../fixtures');
function loadStory(filename: string) {
  return parseStory(readFileSync(resolve(fixturesDir, filename), 'utf-8'));
}

describe('generateCiQualityGate', () => {
  it('returns non-empty YAML string', () => {
    const result = generateCiQualityGate(loadStory('story-complete.md'));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('sets workflow name to Quality Gate', () => {
    expect(generateCiQualityGate(loadStory('story-complete.md'))).toContain('Quality Gate');
  });

  it('triggers on pull_request to main', () => {
    const result = generateCiQualityGate(loadStory('story-complete.md'));
    expect(result).toContain('pull_request');
    expect(result).toContain('main');
  });

  it('includes 80% coverage enforcement in test command for typescript story', () => {
    const result = generateCiQualityGate(loadStory('story-complete.md'));
    expect(result).toContain('80');
    expect(result).toContain('vitest');
  });

  it('includes maven verify with jacoco for java story', () => {
    const result = generateCiQualityGate(loadStory('story-java-kafka-aws.md'));
    expect(result).toContain('mvnw verify');
    expect(result).toContain('jacoco');
  });

  it('includes eslint lint step for typescript story', () => {
    expect(generateCiQualityGate(loadStory('story-complete.md'))).toContain('eslint');
  });

  it('includes coverage artifact upload step', () => {
    expect(generateCiQualityGate(loadStory('story-complete.md'))).toContain('upload-artifact');
  });

  it('uses node setup for typescript story', () => {
    expect(generateCiQualityGate(loadStory('story-complete.md'))).toContain('setup-node');
  });

  it('uses java setup for java story', () => {
    expect(generateCiQualityGate(loadStory('story-java-kafka-aws.md'))).toContain('setup-java');
  });
});

describe('generateCiSecurityScan', () => {
  it('returns non-empty YAML string', () => {
    const result = generateCiSecurityScan();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes TruffleHog for secret detection', () => {
    expect(generateCiSecurityScan()).toContain('trufflehog');
  });

  it('includes Semgrep for SAST', () => {
    expect(generateCiSecurityScan()).toContain('semgrep');
  });

  it('triggers on pull_request and weekly schedule', () => {
    const result = generateCiSecurityScan();
    expect(result).toContain('pull_request');
    expect(result).toContain('schedule');
    expect(result).toContain('cron');
  });
});
