import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { CoverageThresholdValidator } from '../../../../src/validator/auto/CoverageThresholdValidator';
import type { IFileSystem } from '../../../../src/generator/utils/IFileSystem';
import type { ValidatorContext } from '../../../../src/validator/auto/types';

const summaryRel = path.join('coverage', 'coverage-summary.json');

function makeFs(summary?: object): IFileSystem {
  const summaryAbs = path.join('/ws', summaryRel);
  return {
    ensureDir: async () => {},
    writeFile: async () => {},
    readFile: async (p: string) => {
      if (p === summaryAbs && summary) return JSON.stringify(summary);
      throw new Error(`ENOENT: ${p}`);
    },
    fileExists: async (p: string) => p === summaryAbs && !!summary,
    listDir: async () => [],
    deleteFile: async () => {},
    deleteDir: async () => {},
  };
}

function ctx(fs: IFileSystem, storyFiles: string[] = []): ValidatorContext {
  return { workspaceRoot: '/ws', fs, storyFiles };
}

function fileEntry(pct: number) {
  return {
    lines: { total: 100, covered: pct, skipped: 0, pct },
    statements: { total: 100, covered: pct, skipped: 0, pct },
    functions: { total: 10, covered: pct / 10, skipped: 0, pct },
    branches: { total: 50, covered: pct / 2, skipped: 0, pct },
  };
}

describe('CoverageThresholdValidator', () => {
  it('emits delegated-to-revisor finding when summary is absent', async () => {
    const v = new CoverageThresholdValidator();
    const findings = await v.run(ctx(makeFs()));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warn');
    expect(findings[0].delegatedToRevisor?.command).toMatch(/coverage/);
  });

  it('emits error when summary file is malformed', async () => {
    const fs: IFileSystem = {
      ...makeFs({}),
      readFile: async () => '{not valid',
      fileExists: async () => true,
    };
    const v = new CoverageThresholdValidator();
    const findings = await v.run(ctx(fs, ['src/a.ts']));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
  });

  it('returns empty when there are no story files', async () => {
    const v = new CoverageThresholdValidator();
    const findings = await v.run(ctx(makeFs({ total: fileEntry(100) })));
    expect(findings).toEqual([]);
  });

  it('passes when all metrics meet thresholds', async () => {
    const summary = { '/ws/src/a.ts': fileEntry(95) };
    const v = new CoverageThresholdValidator();
    const findings = await v.run(ctx(makeFs(summary), ['src/a.ts']));
    expect(findings).toEqual([]);
  });

  it('flags each metric below its threshold', async () => {
    const summary = {
      '/ws/src/a.ts': {
        lines: { total: 100, covered: 70, skipped: 0, pct: 70 },
        statements: { total: 100, covered: 75, skipped: 0, pct: 75 },
        functions: { total: 10, covered: 9, skipped: 0, pct: 90 },
        branches: { total: 50, covered: 25, skipped: 0, pct: 50 },
      },
    };
    const v = new CoverageThresholdValidator();
    const findings = await v.run(ctx(makeFs(summary), ['src/a.ts']));
    const metrics = findings.map((f) => f.metadata?.metric).sort();
    expect(metrics).toEqual(['branches', 'lines', 'statements']);
    expect(findings.every((f) => f.severity === 'error')).toBe(true);
  });

  it('warns when story file has no coverage entry', async () => {
    const summary = { '/ws/src/other.ts': fileEntry(100) };
    const v = new CoverageThresholdValidator();
    const findings = await v.run(ctx(makeFs(summary), ['src/missing.ts']));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warn');
    expect(findings[0].path).toBe('src/missing.ts');
  });

  it('matches story files by suffix even with different roots', async () => {
    const summary = { '/abs/path/to/src/a.ts': fileEntry(50) };
    const v = new CoverageThresholdValidator();
    const findings = await v.run(ctx(makeFs(summary), ['src/a.ts']));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.path === 'src/a.ts')).toBe(true);
  });

  it('respects custom thresholds passed to the constructor', async () => {
    const summary = { '/ws/src/a.ts': fileEntry(85) };
    const strict = new CoverageThresholdValidator({
      lines: 90,
      statements: 90,
      functions: 90,
      branches: 90,
    });
    const findings = await strict.run(ctx(makeFs(summary), ['src/a.ts']));
    expect(findings.length).toBe(4);
  });
});
