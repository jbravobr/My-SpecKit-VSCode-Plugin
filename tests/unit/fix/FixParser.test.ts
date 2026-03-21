import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFix } from '../../../src/fix/FixParser';

const fixturesDir = resolve(__dirname, '../../fixtures');
const completeFixMd = readFileSync(resolve(fixturesDir, 'fix-complete.md'), 'utf-8');
const emptyFixMd = readFileSync(resolve(fixturesDir, 'fix-empty.md'), 'utf-8');

describe('parseFix', () => {
  it('parses a complete fix correctly', () => {
    const fix = parseFix(completeFixMd);

    expect(fix.metadata.id).toBe('001');
    expect(fix.metadata.title).toBe('Login OAuth2 retorna 500 após expiração do token');
    expect(fix.metadata.createdAt).toBe('2026-01-15');
    expect(fix.metadata.version).toBe(1);
    expect(fix.metadata.type).toBe('fix');
    expect(fix.metadata.status).toBe('open');

    expect(fix.bugDescription.title).toContain('500 quando token expirado');
    expect(fix.bugDescription.symptoms).toContain('HTTP 500');
    expect(fix.bugDescription.stepsToReproduce).toHaveLength(3);
    expect(fix.bugDescription.stepsToReproduce[0]).toContain('GitHub OAuth2');
    expect(fix.bugDescription.environment).toContain('Node.js 20');
    expect(fix.bugDescription.frequency).toBe('sempre');

    expect(fix.rootCauseHypothesis.hypothesis).toContain('TokenExpiredError');
    expect(fix.rootCauseHypothesis.suspectedFiles).toHaveLength(2);
    expect(fix.rootCauseHypothesis.suspectedFiles[0]).toContain('auth.ts');

    expect(fix.impactAssessment.severity).toBe('high');
    expect(fix.impactAssessment.affectedUsers).toContain('sessões longas');
    expect(fix.impactAssessment.regressionRisk).toContain('middleware');

    expect(fix.regressionPrevention.testsToAdd).toHaveLength(2);
    expect(fix.regressionPrevention.testsToAdd[0]).toContain('401');

    expect(fix.dof.criteria).toHaveLength(5);
  });

  it('parses an empty fix without throwing', () => {
    expect(() => parseFix(emptyFixMd)).not.toThrow();
    const fix = parseFix(emptyFixMd);
    expect(fix.metadata.id).toBe('001');
    expect(fix.metadata.type).toBe('fix');
    expect(fix.bugDescription.title).toBe('');
    expect(fix.bugDescription.symptoms).toBe('');
    expect(fix.bugDescription.stepsToReproduce).toHaveLength(0);
    expect(fix.rootCauseHypothesis.hypothesis).toBe('');
    expect(fix.impactAssessment.severity).toBe('');
  });

  it('cleanTodo removes TODO comments from section fields', () => {
    const fix = parseFix(emptyFixMd);
    expect(fix.bugDescription.title).not.toContain('TODO');
    expect(fix.bugDescription.symptoms).not.toContain('TODO');
    expect(fix.impactAssessment.severity).not.toContain('TODO');
    expect(fix.rootCauseHypothesis.hypothesis).not.toContain('TODO');
  });

  it('parses DoF items correctly from empty template', () => {
    const fix = parseFix(emptyFixMd);
    expect(fix.dof.criteria).toHaveLength(5);
    expect(fix.dof.criteria[0]).toContain('Bug não reproduz');
    expect(fix.dof.criteria[2]).toContain('Testes de regressão');
  });

  it('extracts metadata fields correctly', () => {
    const fix = parseFix(completeFixMd);
    expect(fix.metadata.version).toBe(1);
    expect(fix.metadata.createdAt).toBe('2026-01-15');
    expect(fix.metadata.type).toBe('fix');
  });
});
