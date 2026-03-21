import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { generateFixTemplate } from '../../../src/fix/FixTemplate';
import { parseFix } from '../../../src/fix/FixParser';

describe('generateFixTemplate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('contains the provided id', () => {
    const template = generateFixTemplate('001');
    expect(template).toContain('id: 001');
    expect(template).toContain('# Fix 001');
  });

  it('contains today\'s date', () => {
    const template = generateFixTemplate('042');
    expect(template).toContain('createdAt: 2026-03-20');
  });

  it('contains type: fix in metadata', () => {
    const template = generateFixTemplate('001');
    expect(template).toContain('type: fix');
  });

  it('contains all required sections', () => {
    const template = generateFixTemplate('001');
    expect(template).toContain('## Bug Description');
    expect(template).toContain('## Root Cause Hypothesis');
    expect(template).toContain('## Impact Assessment');
    expect(template).toContain('## Regression Prevention');
    expect(template).toContain('## DoF — Definition of Fixed');
  });

  it('is parseable by FixParser without throwing', () => {
    const template = generateFixTemplate('007');
    expect(() => parseFix(template)).not.toThrow();
  });

  it('parses to empty section fields (all TODOs)', () => {
    const template = generateFixTemplate('001');
    const fix = parseFix(template);
    expect(fix.metadata.id).toBe('001');
    expect(fix.metadata.type).toBe('fix');
    expect(fix.bugDescription.title).toBe('');
    expect(fix.bugDescription.symptoms).toBe('');
    expect(fix.bugDescription.stepsToReproduce).toHaveLength(0);
    expect(fix.rootCauseHypothesis.hypothesis).toBe('');
    expect(fix.impactAssessment.severity).toBe('');
  });

  it('template DoF has 5 criteria', () => {
    const template = generateFixTemplate('001');
    const fix = parseFix(template);
    expect(fix.dof.criteria).toHaveLength(5);
  });
});
