import { describe, it, expect } from 'vitest';
import {
  GateEvidenceCollector,
  DEFAULT_GATE_VALIDATORS,
} from '../../../src/workflow/GateEvidenceCollector';
import type { Validator, Finding, ValidatorContext } from '../../../src/validator/auto/types';
import type { IFileSystem } from '../../../src/generator/utils/IFileSystem';

const fs: IFileSystem = {
  ensureDir: async () => {},
  writeFile: async () => {},
  readFile: async () => '',
  fileExists: async () => false,
  listDir: async () => [],
  deleteFile: async () => {},
  deleteDir: async () => {},
};

function makeValidator(id: string, findings: Finding[] = []): Validator {
  return {
    id,
    description: `mock-${id}`,
    run: async (_ctx: ValidatorContext) => findings,
  };
}

describe('GateEvidenceCollector', () => {
  it('returns passed=true and no findings when gate has no validators (gate 4)', async () => {
    const c = new GateEvidenceCollector();
    const r = await c.collect({ workspaceRoot: '/', fs, gateTarget: 4 });
    expect(r.passed).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.validatorsRun).toEqual([]);
  });

  it('runs only validators mapped to the gate', async () => {
    const c = new GateEvidenceCollector({
      validators: [
        makeValidator('story-heuristic'),
        makeValidator('typecheck'),
        makeValidator('crap'),
      ],
      gateMap: { 1: ['typecheck'] },
    });
    const r = await c.collect({ workspaceRoot: '/', fs, gateTarget: 1 });
    expect(r.validatorsRun).toEqual(['typecheck']);
    expect(r.passed).toBe(true);
  });

  it('marks passed=false when any finding has blocking severity', async () => {
    const c = new GateEvidenceCollector({
      validators: [
        makeValidator('typecheck', [
          {
            validator: 'typecheck',
            severity: 'error',
            message: 'TS2322',
            path: 'a.ts',
            line: 1,
          },
        ]),
      ],
      gateMap: { 2: ['typecheck'] },
    });
    const r = await c.collect({ workspaceRoot: '/', fs, gateTarget: 2 });
    expect(r.passed).toBe(false);
    expect(r.findings).toHaveLength(1);
  });

  it('marks passed=true when only warn-level findings exist', async () => {
    const c = new GateEvidenceCollector({
      validators: [
        makeValidator('typecheck', [
          { validator: 'typecheck', severity: 'warn', message: 'minor' },
        ]),
      ],
      gateMap: { 2: ['typecheck'] },
    });
    const r = await c.collect({ workspaceRoot: '/', fs, gateTarget: 2 });
    expect(r.passed).toBe(true);
    expect(r.findings).toHaveLength(1);
  });

  it('exposes default gate→validators map', () => {
    expect(DEFAULT_GATE_VALIDATORS[0]).toContain('story-heuristic');
    expect(DEFAULT_GATE_VALIDATORS[3]).toEqual(
      expect.arrayContaining(['test-execution', 'coverage-threshold', 'crap']),
    );
    expect(DEFAULT_GATE_VALIDATORS[4]).toEqual([]);
  });

  it('allows runtime registration via registerValidator', async () => {
    const c = new GateEvidenceCollector({ gateMap: { 0: ['x'] } });
    c.registerValidator(makeValidator('x', [{ validator: 'x', severity: 'info', message: 'hi' }]));
    const r = await c.collect({ workspaceRoot: '/', fs, gateTarget: 0 });
    expect(r.findings).toHaveLength(1);
    expect(r.validatorsRun).toEqual(['x']);
  });

  it('aggregates findings from multiple validators on same gate', async () => {
    const c = new GateEvidenceCollector({
      validators: [
        makeValidator('a', [{ validator: 'a', severity: 'warn', message: 'A1' }]),
        makeValidator('b', [{ validator: 'b', severity: 'error', message: 'B1' }]),
      ],
      gateMap: { 3: ['a', 'b'] },
    });
    const r = await c.collect({ workspaceRoot: '/', fs, gateTarget: 3 });
    expect(r.findings).toHaveLength(2);
    expect(r.passed).toBe(false);
    expect(r.validatorsRun.sort()).toEqual(['a', 'b']);
  });

  it('returns a runId on each collect call', async () => {
    const c = new GateEvidenceCollector({
      validators: [makeValidator('story-heuristic')],
    });
    const r = await c.collect({ workspaceRoot: '/', fs, gateTarget: 0 });
    expect(r.runId).toBeTruthy();
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });
});
