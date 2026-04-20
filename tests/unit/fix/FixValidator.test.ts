import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFix } from '../../../src/fix/FixParser';
import { validateFix } from '../../../src/fix/FixValidator';
import { Fix } from '../../../src/fix/Fix';

const fixturesDir = resolve(__dirname, '../../fixtures');
const completeFixMd = readFileSync(resolve(fixturesDir, 'fix-complete.md'), 'utf-8');
const partialFixMd = readFileSync(resolve(fixturesDir, 'fix-partial.md'), 'utf-8');

function buildCompleteFix(): Fix {
  return parseFix(completeFixMd);
}

describe('validateFix', () => {
  it('returns valid:true for a complete fix', () => {
    const fix = buildCompleteFix();
    const result = validateFix(fix);
    expect(result.valid).toBe(true);
    expect(result.gaps).toHaveLength(0);
  });

  it('generates gap for missing title', () => {
    const fix = buildCompleteFix();
    fix.bugDescription.title = '';
    const result = validateFix(fix);
    expect(result.gaps.some((g) => g.field === 'title')).toBe(true);
    expect(result.gaps.find((g) => g.field === 'title')?.section).toBe('Bug Description');
  });

  it('generates gap for missing symptoms', () => {
    const fix = buildCompleteFix();
    fix.bugDescription.symptoms = '';
    const result = validateFix(fix);
    expect(result.gaps.some((g) => g.field === 'symptoms')).toBe(true);
  });

  it('generates gap for missing stepsToReproduce', () => {
    const fix = buildCompleteFix();
    fix.bugDescription.stepsToReproduce = [];
    const result = validateFix(fix);
    expect(result.gaps.some((g) => g.field === 'stepsToReproduce')).toBe(true);
  });

  it('generates gap for missing hypothesis', () => {
    const fix = buildCompleteFix();
    fix.rootCauseHypothesis.hypothesis = '';
    const result = validateFix(fix);
    expect(result.gaps.some((g) => g.field === 'hypothesis')).toBe(true);
    expect(result.gaps.find((g) => g.field === 'hypothesis')?.section).toBe(
      'Root Cause Hypothesis',
    );
  });

  it('generates gap for invalid severity', () => {
    const fix = buildCompleteFix();
    fix.impactAssessment.severity = '' as any;
    const result = validateFix(fix);
    expect(result.gaps.some((g) => g.field === 'severity')).toBe(true);
    expect(result.gaps.find((g) => g.field === 'severity')?.section).toBe('Impact Assessment');
  });

  it('generates gap for unrecognized severity value', () => {
    const fix = buildCompleteFix();
    fix.impactAssessment.severity = 'urgent' as any;
    const result = validateFix(fix);
    expect(result.gaps.some((g) => g.field === 'severity')).toBe(true);
  });

  it('generates gap for missing DoF criteria', () => {
    const fix = buildCompleteFix();
    fix.dof.criteria = [];
    const result = validateFix(fix);
    expect(result.gaps.some((g) => g.field === 'criteria')).toBe(true);
    expect(result.gaps.find((g) => g.field === 'criteria')?.section).toBe('DoF');
  });

  it('returns invalid for partial fix', () => {
    const fix = parseFix(partialFixMd);
    const result = validateFix(fix);
    expect(result.valid).toBe(false);
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it('partial fix has gaps for stepsToReproduce, hypothesis and severity', () => {
    const fix = parseFix(partialFixMd);
    const result = validateFix(fix);
    expect(result.gaps.some((g) => g.field === 'stepsToReproduce')).toBe(true);
    expect(result.gaps.some((g) => g.field === 'hypothesis')).toBe(true);
    expect(result.gaps.some((g) => g.field === 'severity')).toBe(true);
  });
});
