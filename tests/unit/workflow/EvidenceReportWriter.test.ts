import { describe, it, expect, beforeEach } from 'vitest';
import { EvidenceReportWriter } from '../../../src/workflow/EvidenceReportWriter';
import type { EvidenceReport } from '../../../src/workflow/GateEvidenceCollector';
import type { IFileSystem } from '../../../src/generator/utils/IFileSystem';

interface MemFS extends IFileSystem {
  files: Map<string, string>;
  dirs: Set<string>;
}

function memFs(): MemFS {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    ensureDir: async (p) => {
      dirs.add(p.replace(/\\/g, '/'));
    },
    writeFile: async (p, c) => {
      files.set(p.replace(/\\/g, '/'), c);
    },
    readFile: async (p) => {
      const k = p.replace(/\\/g, '/');
      if (!files.has(k)) throw new Error(`ENOENT: ${p}`);
      return files.get(k)!;
    },
    fileExists: async (p) => files.has(p.replace(/\\/g, '/')),
    listDir: async () => [],
    deleteFile: async () => {},
    deleteDir: async () => {},
  };
}

describe('EvidenceReportWriter', () => {
  let fs: MemFS;
  beforeEach(() => {
    fs = memFs();
  });

  function report(passed: boolean): EvidenceReport {
    return {
      gate: 2,
      passed,
      runId: 'run-123',
      durationMs: 11,
      validatorsRun: ['typecheck'],
      findings: passed
        ? []
        : [
            {
              validator: 'typecheck',
              severity: 'error',
              message: 'TS2322',
              path: 'a.ts',
              line: 1,
            },
          ],
    };
  }

  it('creates evidence directory and writes md+json+latest', async () => {
    const w = new EvidenceReportWriter(fs, '/ws');
    const result = await w.write(report(true), 'STORY-1');
    expect(fs.dirs.has('/ws/.speckit/evidence')).toBe(true);
    expect(fs.files.has(result.reportPath)).toBe(true);
    expect(fs.files.has(result.jsonPath)).toBe(true);
    expect(fs.files.has(result.latestPath)).toBe(true);
    expect(result.reportPath).toContain('STORY-1');
    expect(result.reportPath).toContain('run-123');
  });

  it('includes prompt summary line in the markdown', async () => {
    const w = new EvidenceReportWriter(fs, '/ws');
    await w.write(report(false), 'STORY-2');
    const md = fs.files.get('/ws/.speckit/evidence/latest.md')!;
    expect(md).toContain('# Evidência — Gate 2');
    expect(md).toContain('BLOQUEADO');
    expect(md).toContain('a.ts:1');
  });

  it('serializes findings array to JSON evidence', async () => {
    const w = new EvidenceReportWriter(fs, '/ws');
    const result = await w.write(report(false), 'STORY-3');
    const json = JSON.parse(fs.files.get(result.jsonPath)!) as {
      findings: unknown[];
      passed: boolean;
    };
    expect(json.findings).toHaveLength(1);
    expect(json.passed).toBe(false);
  });

  it('works without specId', async () => {
    const w = new EvidenceReportWriter(fs, '/ws');
    const result = await w.write(report(true));
    expect(result.reportPath).toBe('/ws/.speckit/evidence/run-123.md');
  });

  it('overwrites latest.md on each write', async () => {
    const w = new EvidenceReportWriter(fs, '/ws');
    await w.write(report(true), 'A');
    await w.write({ ...report(false), runId: 'run-999' }, 'B');
    const md = fs.files.get('/ws/.speckit/evidence/latest.md')!;
    expect(md).toContain('run-999');
  });
});
