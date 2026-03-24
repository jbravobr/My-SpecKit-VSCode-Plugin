import { describe, it, expect } from 'vitest';
import { generateSecurityTests } from '../../../../src/generator/baseline/SecurityTestsGenerator';

describe('SecurityTestsGenerator', () => {
  it('returns non-empty string', () => {
    const result = generateSecurityTests();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains applyTo frontmatter', () => {
    expect(generateSecurityTests()).toContain('applyTo');
  });

  it('covers 401 for unauthenticated requests', () => {
    expect(generateSecurityTests()).toContain('401');
  });

  it('covers 403 for insufficient role', () => {
    expect(generateSecurityTests()).toContain('403');
  });

  it('covers no 500 on invalid input as blocking failure', () => {
    const result = generateSecurityTests();
    expect(result).toContain('500');
    expect(result).toContain('bloqueante');
  });

  it('covers no stack trace in error responses', () => {
    expect(generateSecurityTests()).toContain('stack trace');
  });

  it('covers mass assignment protection', () => {
    const result = generateSecurityTests();
    expect(result).toContain('Mass Assignment');
    expect(result).toContain('DTO');
  });

  it('covers rate limiting and repeated failure protection', () => {
    const result = generateSecurityTests();
    expect(result).toContain('rate limit');
    expect(result).toContain('falhas consecutivas');
  });
});
