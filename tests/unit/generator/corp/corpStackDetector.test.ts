import { describe, expect, it } from 'vitest';
import {
  hasAnyDatabase,
  hasAws,
  hasKafka,
  hasMongo,
  hasRabbitmq,
  isSpringBoot,
} from '../../../../src/generator/corp/corpStackDetector';
import { emptyStory, Story } from '../../../../src/story/Story';

function storyWith(overrides: Partial<Story['technicalSpec']>): Story {
  const s = emptyStory();
  s.technicalSpec = { ...s.technicalSpec, ...overrides };
  return s;
}

describe('corpStackDetector', () => {
  describe('isSpringBoot', () => {
    it('true when framework is springboot', () => {
      expect(isSpringBoot(storyWith({ framework: 'springboot' }))).toBe(true);
    });
    it('false otherwise', () => {
      expect(isSpringBoot(storyWith({ framework: 'react' }))).toBe(false);
      expect(isSpringBoot(storyWith({ framework: '' }))).toBe(false);
    });
  });

  describe('hasAws', () => {
    it.each(['aws', 'AWS', 'amazon s3', 'DynamoDB', 'sqs+sns', 'Aurora MySQL', 'rds-proxy'])(
      'true for "%s"',
      (infra) => {
        expect(hasAws(storyWith({ infrastructure: infra }))).toBe(true);
      },
    );
    it('false for unrelated infra', () => {
      expect(hasAws(storyWith({ infrastructure: 'gcp pubsub' }))).toBe(false);
      expect(hasAws(storyWith({ infrastructure: '' }))).toBe(false);
    });
  });

  describe('hasMongo', () => {
    it.each(['mongo', 'MongoDB', 'mongo-atlas'])('true for "%s"', (db) => {
      expect(hasMongo(storyWith({ database: db }))).toBe(true);
    });
    it('false for postgres or empty', () => {
      expect(hasMongo(storyWith({ database: 'postgres' }))).toBe(false);
      expect(hasMongo(storyWith({ database: '' }))).toBe(false);
    });
  });

  describe('hasRabbitmq', () => {
    it.each(['rabbitmq', 'RabbitMQ', 'amqp', 'AMQP 0.9.1'])('true for "%s"', (infra) => {
      expect(hasRabbitmq(storyWith({ infrastructure: infra }))).toBe(true);
    });
    it('false for kafka', () => {
      expect(hasRabbitmq(storyWith({ infrastructure: 'kafka' }))).toBe(false);
    });
  });

  describe('hasKafka', () => {
    it.each(['kafka', 'Kafka cluster', 'AWS MSK Kafka'])('true for "%s"', (infra) => {
      expect(hasKafka(storyWith({ infrastructure: infra }))).toBe(true);
    });
    it('false for rabbit', () => {
      expect(hasKafka(storyWith({ infrastructure: 'rabbitmq' }))).toBe(false);
    });
  });

  describe('hasAnyDatabase', () => {
    it('true for postgres / mongo / aurora', () => {
      expect(hasAnyDatabase(storyWith({ database: 'postgres' }))).toBe(true);
      expect(hasAnyDatabase(storyWith({ database: 'MongoDB' }))).toBe(true);
      expect(hasAnyDatabase(storyWith({ database: 'Aurora MySQL' }))).toBe(true);
    });
    it.each(['', 'NA', 'N/A', '-', 'none', 'nenhum'])('false for sentinel "%s"', (db) => {
      expect(hasAnyDatabase(storyWith({ database: db }))).toBe(false);
    });
  });
});
