import { describe, expect, it } from 'vitest';
import { buildRevisorPrompt } from '../../../src/workflow/RevisorFeedbackBridge';
import type { EvidenceReport } from '../../../src/workflow/GateEvidenceCollector';

function report(over: Partial<EvidenceReport> = {}): EvidenceReport {
  return {
    gate: 3,
    passed: false,
    runId: 'r',
    durationMs: 10,
    validatorsRun: ['typecheck'],
    findings: [
      { validator: 'typecheck', severity: 'error', message: 'oops', path: 'a.ts', line: 1 },
    ],
    ...over,
  };
}

describe('RevisorFeedbackBridge iteration awareness', () => {
  it('omits iteration block when iteration ctx not provided', () => {
    const p = buildRevisorPrompt(report());
    expect(p.body).not.toMatch(/Iteração/);
  });

  it('includes attempt/limit when iteration provided', () => {
    const p = buildRevisorPrompt(report(), { attempt: 2, limit: 5 });
    expect(p.body).toMatch(/Iteração: 2\/5/);
    expect(p.summary).toMatch(/iteração 2\/5/);
  });

  it('flags exhausted iteration limit', () => {
    const p = buildRevisorPrompt(report(), { attempt: 6, limit: 5 });
    expect(p.body).toMatch(/LIMITE ATINGIDO/);
  });

  it('shows delta of blocking findings', () => {
    const p = buildRevisorPrompt(report(), {
      attempt: 2,
      limit: 5,
      previousBlockingCount: 3,
    });
    // current: 1 blocking, previous: 3 → delta -2
    expect(p.body).toMatch(/Delta bloqueadores.+-2.+redução/);
  });

  it('warns on AUMENTO when current > previous', () => {
    const p = buildRevisorPrompt(
      report({
        findings: [
          { validator: 'a', severity: 'error', message: 'x' },
          { validator: 'b', severity: 'error', message: 'y' },
          { validator: 'c', severity: 'error', message: 'z' },
        ],
      }),
      { attempt: 2, limit: 5, previousBlockingCount: 1 },
    );
    expect(p.body).toMatch(/AUMENTO/);
  });

  it('lists regressed validators when provided', () => {
    const p = buildRevisorPrompt(report(), {
      attempt: 2,
      limit: 5,
      regressedValidators: ['secret-leak', 'crap'],
    });
    expect(p.body).toMatch(/Regressão.+secret-leak.+crap/);
  });

  it('passes-summary mentions iteration count', () => {
    const p = buildRevisorPrompt(report({ passed: true, findings: [] }), { attempt: 1, limit: 5 });
    expect(p.summary).toMatch(/aprovado.+1ª iteração/);
  });
});
