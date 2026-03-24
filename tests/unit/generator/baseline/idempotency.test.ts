import { describe, it, expect } from 'vitest';
import { generateIdempotency } from '../../../../src/generator/baseline/IdempotencyGenerator';

describe('IdempotencyGenerator', () => {
  it('returns non-empty string', () => {
    const result = generateIdempotency();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains applyTo frontmatter', () => {
    expect(generateIdempotency()).toContain('applyTo');
  });

  it('covers Idempotency-Key header for POST', () => {
    const result = generateIdempotency();
    expect(result).toContain('Idempotency-Key');
    expect(result).toContain('POST');
  });

  it('covers PUT as naturally idempotent', () => {
    const result = generateIdempotency();
    expect(result).toContain('PUT');
  });

  it('covers business key deduplication', () => {
    const result = generateIdempotency();
    expect(result).toContain('chave de negócio');
  });

  it('covers correct HTTP status codes per scenario', () => {
    const result = generateIdempotency();
    expect(result).toContain('201');
    expect(result).toContain('409');
    expect(result).toContain('Retry-After');
  });

  it('covers storage with TTL for idempotency results', () => {
    const result = generateIdempotency();
    expect(result).toContain('TTL');
    expect(result).toContain('Redis');
  });

  it('covers Kafka deduplication', () => {
    expect(generateIdempotency()).toContain('Kafka');
  });
});
