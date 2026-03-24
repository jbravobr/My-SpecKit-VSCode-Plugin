import { describe, it, expect } from 'vitest';
import { generateObservability } from '../../../../src/generator/baseline/ObservabilityGenerator';

describe('ObservabilityGenerator', () => {
  it('returns non-empty string', () => {
    const result = generateObservability();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains applyTo frontmatter', () => {
    expect(generateObservability()).toContain('applyTo');
  });

  it('covers liveness and readiness health checks', () => {
    const result = generateObservability();
    expect(result).toContain('health');
    expect(result).toContain('Liveness');
    expect(result).toContain('Readiness');
  });

  it('covers structured logging with traceId', () => {
    const result = generateObservability();
    expect(result).toContain('traceId');
    expect(result).toContain('JSON');
  });

  it('covers Prometheus metrics', () => {
    expect(generateObservability()).toContain('Prometheus');
  });

  it('covers OpenTelemetry for distributed tracing', () => {
    expect(generateObservability()).toContain('OpenTelemetry');
  });

  it('covers W3C traceparent propagation', () => {
    expect(generateObservability()).toContain('traceparent');
  });

  it('covers SLOs and alerting thresholds', () => {
    const result = generateObservability();
    expect(result).toContain('SLO');
    expect(result).toContain('error rate');
  });
});
