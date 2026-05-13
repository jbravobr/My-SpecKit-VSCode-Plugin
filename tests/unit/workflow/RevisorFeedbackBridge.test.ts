import { describe, it, expect } from 'vitest';
import { buildRevisorPrompt, formatFindingLine } from '../../../src/workflow/RevisorFeedbackBridge';
import type { EvidenceReport } from '../../../src/workflow/GateEvidenceCollector';
import type { Finding } from '../../../src/validator/auto/types';

function report(over: Partial<EvidenceReport> & { findings: Finding[] }): EvidenceReport {
  return {
    gate: 2,
    passed: true,
    runId: 'run-1',
    durationMs: 12,
    validatorsRun: ['typecheck'],
    ...over,
  };
}

describe('formatFindingLine', () => {
  it('formats with path:line, severity emoji and Fix suggestion', () => {
    const line = formatFindingLine({
      validator: 'typecheck',
      severity: 'error',
      message: 'TS2322: type mismatch',
      path: 'src/a.ts',
      line: 7,
      suggestedFix: 'use number',
    });
    expect(line).toBe('src/a.ts:7: ❌ error: TS2322: type mismatch Fix: use number');
  });

  it('falls back to (sem-path) when no path', () => {
    const line = formatFindingLine({ validator: 'x', severity: 'warn', message: 'm' });
    expect(line.startsWith('(sem-path):')).toBe(true);
  });

  it('omits Fix when no suggestedFix', () => {
    const line = formatFindingLine({
      validator: 'x',
      severity: 'info',
      message: 'm',
      path: 'f.ts',
    });
    expect(line).not.toContain('Fix:');
  });
});

describe('buildRevisorPrompt', () => {
  it('reports passed gate with no findings', () => {
    const p = buildRevisorPrompt(report({ findings: [], passed: true, gate: 2 }));
    expect(p.hasBlockingFindings).toBe(false);
    expect(p.summary).toContain('Gate 2');
    expect(p.summary).toContain('aprovado');
    expect(p.body).toContain('Nenhum achado');
  });

  it('groups blockers, warns and delegated sections separately', () => {
    const findings: Finding[] = [
      { validator: 't', severity: 'error', message: 'bad', path: 'a.ts', line: 1 },
      { validator: 't', severity: 'warn', message: 'minor', path: 'b.ts', line: 2 },
      {
        validator: 't',
        severity: 'info',
        message: 'delegate',
        delegatedToRevisor: { reason: 'r', command: 'pytest -q', stack: 'python' },
      },
    ];
    const p = buildRevisorPrompt(report({ findings, passed: false, gate: 3 }));
    expect(p.hasBlockingFindings).toBe(true);
    expect(p.delegatedCommands).toEqual(['pytest -q']);
    expect(p.body).toMatch(/## Bloqueadores \(1\)/);
    expect(p.body).toMatch(/## Avisos \(1\)/);
    expect(p.body).toMatch(/## Validações delegadas ao Revisor \(1\)/);
    expect(p.body).toMatch(/pytest -q/);
    expect(p.summary).toContain('BLOQUEADO');
  });

  it('sorts findings by severity then path then line', () => {
    const findings: Finding[] = [
      { validator: 't', severity: 'warn', message: 'w', path: 'z.ts', line: 9 },
      { validator: 't', severity: 'error', message: 'e2', path: 'b.ts', line: 5 },
      { validator: 't', severity: 'error', message: 'e1', path: 'a.ts', line: 1 },
    ];
    const p = buildRevisorPrompt(report({ findings, passed: false }));
    const idxA = p.body.indexOf('a.ts:1');
    const idxB = p.body.indexOf('b.ts:5');
    const idxZ = p.body.indexOf('z.ts:9');
    expect(idxA).toBeGreaterThan(-1);
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxZ);
  });

  it('only shows Info section when there are no delegated findings', () => {
    const findings: Finding[] = [{ validator: 't', severity: 'info', message: 'note' }];
    const p = buildRevisorPrompt(report({ findings, passed: true }));
    expect(p.body).toMatch(/## Info \(1\)/);
  });

  it('header includes runId, validators, count and durationMs', () => {
    const p = buildRevisorPrompt(
      report({
        findings: [],
        runId: 'abc-123',
        durationMs: 42,
        validatorsRun: ['typecheck', 'crap'],
        gate: 2,
      }),
    );
    expect(p.body).toContain('runId=abc-123');
    expect(p.body).toContain('42ms');
    expect(p.body).toContain('typecheck, crap');
  });
});
