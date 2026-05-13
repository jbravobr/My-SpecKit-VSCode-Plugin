import { describe, it, expect } from 'vitest';
import { runGateVerificationHook } from '../../../src/workflow/GateVerificationHook';
import type { Story } from '../../../src/story/Story';
import { emptyStory } from '../../../src/story/Story';
import { GateEvidenceCollector } from '../../../src/workflow/GateEvidenceCollector';
import type { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import type { Validator, Finding } from '../../../src/validator/auto/types';

function memFs(): { fs: IFileSystem; files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    fs: {
      ensureDir: async () => {},
      writeFile: async (p, c) => {
        files.set(p.replace(/\\/g, '/'), c);
      },
      readFile: async (p) => files.get(p.replace(/\\/g, '/')) ?? '',
      fileExists: async (p) => files.has(p.replace(/\\/g, '/')),
      listDir: async () => [],
      deleteFile: async () => {},
      deleteDir: async () => {},
    },
  };
}

function story(): Story {
  const s = emptyStory();
  s.metadata.id = 'STORY-9';
  s.metadata.gate = 1;
  return s;
}

function mock(id: string, findings: Finding[] = []): Validator {
  return { id, description: id, run: async () => findings };
}

describe('runGateVerificationHook', () => {
  it('returns a report with the requested gate target', async () => {
    const { fs } = memFs();
    const c = new GateEvidenceCollector({
      validators: [mock('typecheck')],
      gateMap: { 2: ['typecheck'] },
    });
    const out = await runGateVerificationHook({
      workspaceRoot: '/ws',
      fs,
      story: story(),
      toGate: 2,
      collector: c,
    });
    expect(out.report.gate).toBe(2);
    expect(out.report.passed).toBe(true);
  });

  it('writes evidence files under .speckit/evidence', async () => {
    const { fs, files } = memFs();
    const c = new GateEvidenceCollector({
      validators: [mock('typecheck')],
      gateMap: { 2: ['typecheck'] },
    });
    await runGateVerificationHook({
      workspaceRoot: '/ws',
      fs,
      story: story(),
      toGate: 2,
      collector: c,
    });
    const paths = Array.from(files.keys());
    expect(paths.some((p) => p.endsWith('.md'))).toBe(true);
    expect(paths.some((p) => p.endsWith('.json'))).toBe(true);
    expect(paths.some((p) => p.endsWith('/latest.md'))).toBe(true);
  });

  it('marks passed=false when validator emits blocking finding', async () => {
    const { fs } = memFs();
    const c = new GateEvidenceCollector({
      validators: [
        mock('typecheck', [{ validator: 'typecheck', severity: 'error', message: 'TS2322' }]),
      ],
      gateMap: { 2: ['typecheck'] },
    });
    const out = await runGateVerificationHook({
      workspaceRoot: '/ws',
      fs,
      story: story(),
      toGate: 2,
      collector: c,
    });
    expect(out.report.passed).toBe(false);
    expect(out.prompt.hasBlockingFindings).toBe(true);
  });

  it('tolerates git.changedFiles failure without throwing', async () => {
    const { fs } = memFs();
    const c = new GateEvidenceCollector({
      validators: [mock('typecheck')],
      gateMap: { 2: ['typecheck'] },
    });
    const out = await runGateVerificationHook({
      workspaceRoot: '/ws',
      fs,
      git: {
        diff: async () => '',
        commit: async () => {},
        commitFile: async () => {},
        changedFiles: async () => {
          throw new Error('no git');
        },
      } as never,
      story: story(),
      toGate: 2,
      collector: c,
    });
    expect(out.report.gate).toBe(2);
  });

  it('uses default collector when none provided (no validator registered for unmapped gate)', async () => {
    const { fs } = memFs();
    const out = await runGateVerificationHook({
      workspaceRoot: '/ws',
      fs,
      story: story(),
      toGate: 4,
    });
    expect(out.report.gate).toBe(4);
    expect(out.report.validatorsRun).toEqual([]);
  });
});
