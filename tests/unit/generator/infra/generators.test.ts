import { describe, it, expect } from 'vitest';
import { generateKafka } from '../../../../src/generator/infra/KafkaGenerator';
import { generateGlueJob } from '../../../../src/generator/infra/GlueJobGenerator';
import { generateAws } from '../../../../src/generator/infra/AwsGenerator';
import { emptyStory } from '../../../../src/story/Story';

describe('infra generators', () => {
  it('Kafka: returns non-empty string', () => {
    const result = generateKafka();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('GlueJob: returns non-empty string', () => {
    const result = generateGlueJob();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('Aws: returns non-empty string', () => {
    const result = generateAws(emptyStory());
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('Kafka: covers at-least-once, idempotency, DLQ and backoff', () => {
    const result = generateKafka();
    expect(result).toContain('acks=all');
    expect(result).toContain('idempoten');
    expect(result).toContain('DLQ');
    expect(result).toContain('backoff');
  });

  it('Aws: covers DynamoDB, IAM and DefaultCredentialsProvider', () => {
    const result = generateAws(emptyStory());
    expect(result).toContain('DynamoDB');
    expect(result).toContain('IAM');
    expect(result).toContain('DefaultCredentialsProvider');
  });

  it('GlueJob: covers SparkContext, job.commit and pushdown predicates', () => {
    const result = generateGlueJob();
    expect(result).toContain('SparkContext');
    expect(result).toContain('job.commit');
    expect(result).toContain('push_down_predicate');
  });
});
