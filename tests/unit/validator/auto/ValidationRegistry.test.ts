import { describe, it, expect } from 'vitest';
import { ValidationRegistry } from '../../../../src/validator/auto/ValidationRegistry';
import type { Finding, Validator, ValidatorContext } from '../../../../src/validator/auto/types';
import type { IFileSystem } from '../../../../src/generator/utils/IFileSystem';

const fsStub: IFileSystem = {
  ensureDir: async () => {},
  writeFile: async () => {},
  readFile: async () => '',
  fileExists: async () => false,
  listDir: async () => [],
  deleteFile: async () => {},
  deleteDir: async () => {},
};

function ctx(overrides: Partial<ValidatorContext> = {}): ValidatorContext {
  return {
    workspaceRoot: '/tmp/ws',
    fs: fsStub,
    ...overrides,
  };
}

function makeValidator(
  id: string,
  findings: Finding[] = [],
  opts: { throws?: string; delayMs?: number } = {},
): Validator {
  return {
    id,
    description: `validator ${id}`,
    async run() {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts.throws) throw new Error(opts.throws);
      return findings;
    },
  };
}

describe('ValidationRegistry', () => {
  it('registers validators and lists them', () => {
    const reg = new ValidationRegistry();
    reg.register(makeValidator('a'));
    reg.register(makeValidator('b'));
    expect(reg.has('a')).toBe(true);
    expect(
      reg
        .list()
        .map((v) => v.id)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  it('throws when registering duplicate ids', () => {
    const reg = new ValidationRegistry();
    reg.register(makeValidator('a'));
    expect(() => reg.register(makeValidator('a'))).toThrow(/already registered/);
  });

  it('throws when registering empty id', () => {
    const reg = new ValidationRegistry();
    expect(() => reg.register(makeValidator(''))).toThrow(/non-empty id/);
  });

  it('unregisters validators', () => {
    const reg = new ValidationRegistry();
    reg.register(makeValidator('a'));
    reg.unregister('a');
    expect(reg.has('a')).toBe(false);
  });

  it('aggregates findings from all validators', async () => {
    const reg = new ValidationRegistry();
    reg.register(makeValidator('a', [{ validator: 'a', severity: 'info', message: 'i1' }]));
    reg.register(
      makeValidator('b', [
        { validator: 'b', severity: 'warn', message: 'w1' },
        { validator: 'b', severity: 'error', message: 'e1' },
      ]),
    );
    const report = await reg.run(ctx());
    expect(report.findings).toHaveLength(3);
    expect(report.passed).toBe(false);
    expect(report.perValidator.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('marks report as passed when no blocking findings exist', async () => {
    const reg = new ValidationRegistry();
    reg.register(makeValidator('a', [{ validator: 'a', severity: 'info', message: 'i1' }]));
    reg.register(makeValidator('b', [{ validator: 'b', severity: 'warn', message: 'w1' }]));
    const report = await reg.run(ctx());
    expect(report.passed).toBe(true);
  });

  it('marks report as failed when blocker finding is present', async () => {
    const reg = new ValidationRegistry();
    reg.register(makeValidator('a', [{ validator: 'a', severity: 'blocker', message: 'stop' }]));
    const report = await reg.run(ctx());
    expect(report.passed).toBe(false);
  });

  it('captures thrown errors as error-severity findings without crashing', async () => {
    const reg = new ValidationRegistry();
    reg.register(makeValidator('boom', [], { throws: 'kaboom' }));
    reg.register(makeValidator('ok', [{ validator: 'ok', severity: 'info', message: 'fine' }]));
    const report = await reg.run(ctx());
    expect(report.findings).toHaveLength(2);
    const errorFinding = report.findings.find((f) => f.validator === 'boom');
    expect(errorFinding?.severity).toBe('error');
    expect(errorFinding?.message).toMatch(/kaboom/);
    expect(report.perValidator.find((p) => p.id === 'boom')?.error).toBe('kaboom');
    expect(report.passed).toBe(false);
  });

  it('filters validators by opts.only', async () => {
    const reg = new ValidationRegistry();
    reg.register(makeValidator('a', [{ validator: 'a', severity: 'info', message: 'i1' }]));
    reg.register(makeValidator('b', [{ validator: 'b', severity: 'info', message: 'i2' }]));
    const report = await reg.run(ctx(), { only: ['b'] });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].validator).toBe('b');
    expect(report.perValidator).toHaveLength(1);
  });

  it('returns empty passed report when registry is empty', async () => {
    const reg = new ValidationRegistry();
    const report = await reg.run(ctx());
    expect(report.findings).toEqual([]);
    expect(report.perValidator).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it('emits a runId for traceability', async () => {
    const reg = new ValidationRegistry();
    const a = await reg.run(ctx());
    const b = await reg.run(ctx());
    expect(a.runId).toMatch(/^exec-/);
    expect(a.runId).not.toBe(b.runId);
  });

  it('honors gateTarget in the report', async () => {
    const reg = new ValidationRegistry();
    reg.register(makeValidator('a'));
    const report = await reg.run(ctx({ gateTarget: 2 }));
    expect(report.gateTarget).toBe(2);
  });

  it('respects abort signal by short-circuiting pending validators', async () => {
    const reg = new ValidationRegistry();
    reg.register(makeValidator('a', [{ validator: 'a', severity: 'info', message: 'i' }]));
    reg.register(makeValidator('b', [{ validator: 'b', severity: 'info', message: 'i' }]));
    const controller = new AbortController();
    controller.abort();
    const report = await reg.run(ctx({ signal: controller.signal }), { concurrency: 1 });
    expect(report.findings).toHaveLength(0);
    expect(report.perValidator.every((p) => p.error === 'aborted')).toBe(true);
  });

  it('runs validators with concurrency in parallel (faster than serial)', async () => {
    const reg = new ValidationRegistry();
    for (let i = 0; i < 4; i++) {
      reg.register(makeValidator(`d${i}`, [], { delayMs: 30 }));
    }
    const t0 = Date.now();
    await reg.run(ctx(), { concurrency: 4 });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(120);
  });
});
