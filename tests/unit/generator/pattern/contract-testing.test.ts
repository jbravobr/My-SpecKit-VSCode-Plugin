import { describe, it, expect } from 'vitest';
import { generateContractTesting } from '../../../../src/generator/pattern/ContractTestingGenerator';

describe('ContractTestingGenerator', () => {
  it('returns non-empty string', () => {
    const result = generateContractTesting();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains applyTo frontmatter', () => {
    expect(generateContractTesting()).toContain('applyTo');
  });

  it('covers WireMock stubs', () => {
    expect(generateContractTesting()).toContain('WireMock');
  });

  it('covers Pact consumer-driven contracts', () => {
    expect(generateContractTesting()).toContain('Pact');
  });

  it('covers timeout stub scenario for circuit breaker validation', () => {
    expect(generateContractTesting()).toContain('timeout');
    expect(generateContractTesting()).toContain('circuit');
  });

  it('covers 500 downstream error mapping to 503', () => {
    const result = generateContractTesting();
    expect(result).toContain('500');
    expect(result).toContain('503');
  });

  it('covers Gate 2 checklist for BFF contract testing', () => {
    expect(generateContractTesting()).toContain('Gate 2');
  });
});
