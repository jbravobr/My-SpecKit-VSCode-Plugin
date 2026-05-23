import { describe, expect, it } from 'vitest';
import { generateCorpSkills } from '../../../../src/generator/corp/CorpSkillsGenerator';
import { emptyStory, Story } from '../../../../src/story/Story';

function storyWith(overrides: Partial<Story['technicalSpec']>): Story {
  const s = emptyStory();
  s.technicalSpec = { ...s.technicalSpec, ...overrides };
  return s;
}

function names(story: Story): string[] {
  return generateCorpSkills(story)
    .map((s) => s.name)
    .sort();
}

describe('generateCorpSkills', () => {
  it('returns only the universal pair for a neutral stack (no db/infra/spring)', () => {
    const result = names(storyWith({ language: 'typescript', framework: 'react' }));
    expect(result).toEqual(['corp-http-integration', 'corp-naming-conventions']);
  });

  it('includes spring trio when framework is springboot', () => {
    const result = names(storyWith({ language: 'java', framework: 'springboot' }));
    expect(result).toContain('corp-spring-scheduled');
    expect(result).toContain('corp-spring-config');
    expect(result).toContain('corp-spring-rest');
  });

  it('includes aws skills when infrastructure mentions aws/dynamodb/aurora', () => {
    const result = names(storyWith({ infrastructure: 'AWS Lambda + DynamoDB' }));
    expect(result).toContain('corp-aws-secrets');
    expect(result).toContain('corp-aws-credentials');
  });

  it('includes corp-mongo only when database mentions mongo', () => {
    expect(names(storyWith({ database: 'MongoDB' }))).toContain('corp-mongo');
    expect(names(storyWith({ database: 'postgres' }))).not.toContain('corp-mongo');
  });

  it('includes corp-data-access for any non-sentinel database value', () => {
    expect(names(storyWith({ database: 'postgres' }))).toContain('corp-data-access');
    expect(names(storyWith({ database: 'MongoDB' }))).toContain('corp-data-access');
    expect(names(storyWith({ database: 'NA' }))).not.toContain('corp-data-access');
    expect(names(storyWith({ database: '' }))).not.toContain('corp-data-access');
  });

  it('includes rabbitmq pair when infrastructure mentions rabbit/amqp', () => {
    const result = names(storyWith({ infrastructure: 'RabbitMQ cluster' }));
    expect(result).toContain('corp-rabbitmq-listener');
    expect(result).toContain('corp-rabbitmq-config');
  });

  it('includes corp-kafka when infra mentions kafka; corp-kafka-spring only with springboot', () => {
    const noSpring = names(storyWith({ infrastructure: 'kafka' }));
    expect(noSpring).toContain('corp-kafka');
    expect(noSpring).not.toContain('corp-kafka-spring');

    const withSpring = names(
      storyWith({ infrastructure: 'kafka', framework: 'springboot', language: 'java' }),
    );
    expect(withSpring).toContain('corp-kafka');
    expect(withSpring).toContain('corp-kafka-spring');
  });

  it('corp-heavy stack (springboot + aws + mongo + kafka + rabbit) returns 12 skills', () => {
    const result = names(
      storyWith({
        language: 'java',
        framework: 'springboot',
        database: 'MongoDB',
        infrastructure: 'AWS MSK Kafka + RabbitMQ + S3',
      }),
    );
    // 2 always + 3 spring + 2 aws + 1 mongo + 1 data-access + 2 rabbit + 1 kafka + 1 kafka-spring = 13
    expect(result).toHaveLength(13);
  });

  it('every skill has a parseable frontmatter with name field', () => {
    const skills = generateCorpSkills(
      storyWith({
        language: 'java',
        framework: 'springboot',
        database: 'MongoDB',
        infrastructure: 'AWS Kafka RabbitMQ',
      }),
    );
    for (const skill of skills) {
      expect(skill.content.startsWith('---\n')).toBe(true);
      expect(skill.content).toContain(`name: ${skill.name}`);
      expect(skill.content).toContain('description:');
    }
  });

  it('java-only skills have applyTo restriction', () => {
    const skills = generateCorpSkills(
      storyWith({ language: 'java', framework: 'springboot', infrastructure: 'kafka' }),
    );
    const javaOnly = [
      'corp-spring-scheduled',
      'corp-spring-config',
      'corp-spring-rest',
      'corp-kafka-spring',
    ];
    for (const name of javaOnly) {
      const found = skills.find((s) => s.name === name);
      expect(found?.content).toContain('applyTo: "**/*.java"');
    }
  });

  it('multi-stack skills have no applyTo restriction', () => {
    const skills = generateCorpSkills(storyWith({ infrastructure: 'aws kafka rabbitmq' }));
    const multi = [
      'corp-http-integration',
      'corp-naming-conventions',
      'corp-aws-secrets',
      'corp-kafka',
      'corp-rabbitmq-listener',
    ];
    for (const name of multi) {
      const found = skills.find((s) => s.name === name);
      expect(found?.content).not.toContain('applyTo:');
    }
  });
});
