import { describe, expect, it } from 'vitest';
import { MetricsRecorder, summarize } from '../../../src/workflow/MetricsRecorder';
import type { IFileSystem } from '../../../src/generator/utils/IFileSystem';

function inMemoryFs(): { fs: IFileSystem; files: Map<string, string> } {
  const files = new Map<string, string>();
  const fs: IFileSystem = {
    ensureDir: async () => {},
    writeFile: async (p, c) => {
      files.set(p, c);
    },
    readFile: async (p) => {
      if (!files.has(p)) throw new Error('not found: ' + p);
      return files.get(p)!;
    },
    fileExists: async (p) => files.has(p),
    listDir: async () => Array.from(files.keys()),
    deleteFile: async (p) => {
      files.delete(p);
    },
    deleteDir: async () => {},
  };
  return { fs, files };
}

describe('MetricsRecorder', () => {
  it('writes JSONL events appended', async () => {
    const { fs, files } = inMemoryFs();
    const rec = new MetricsRecorder(fs, '/ws');
    await rec.record({ type: 'verify-command', ts: '2026-01-01T00:00:00Z' });
    await rec.record({ type: 'gate-verification', ts: '2026-01-02T00:00:00Z', durationMs: 100 });
    const content = files.get('/ws/.speckit/metrics/events.jsonl')!;
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).type).toBe('verify-command');
    expect(JSON.parse(lines[1]).durationMs).toBe(100);
  });

  it('caps file size by dropping oldest lines', async () => {
    const { fs } = inMemoryFs();
    const rec = new MetricsRecorder(fs, '/ws', 200);
    for (let i = 0; i < 50; i++) {
      await rec.record({ type: 'verify-command', ts: '2026-01-01T00:00:00Z', durationMs: i });
    }
    const all = await rec.readAll();
    expect(all.length).toBeLessThan(50);
    expect(all[all.length - 1].durationMs).toBe(49);
  });

  it('recordEvidence emits a structured event', async () => {
    const { fs } = inMemoryFs();
    const rec = new MetricsRecorder(fs, '/ws');
    await rec.recordEvidence('STORY-1', {
      gate: 2,
      passed: false,
      findings: [
        { validator: 'x', severity: 'blocker', message: 'm' },
        { validator: 'y', severity: 'warn', message: 'n' },
      ],
      runId: 'r',
      durationMs: 42,
      validatorsRun: ['x', 'y'],
    });
    const events = await rec.readAll();
    expect(events).toHaveLength(1);
    expect(events[0].findingsBlocking).toBe(1);
    expect(events[0].validatorsRun).toEqual(['x', 'y']);
  });

  it('readAll returns [] when file missing', async () => {
    const { fs } = inMemoryFs();
    const rec = new MetricsRecorder(fs, '/ws');
    expect(await rec.readAll()).toEqual([]);
  });

  it('summarize computes aggregates and p95', () => {
    const summary = summarize([
      { type: 'verify-command', ts: '2026-01-01', durationMs: 10, passed: true, gate: 2 },
      { type: 'verify-command', ts: '2026-01-02', durationMs: 20, passed: false, gate: 2 },
      { type: 'gate-verification', ts: '2026-01-03', durationMs: 30, passed: true, gate: 3 },
      { type: 'gate-verification', ts: '2026-01-04', durationMs: 40, passed: false, gate: 3 },
    ]);
    expect(summary.total).toBe(4);
    expect(summary.passRate).toBeCloseTo(0.5);
    expect(summary.avgDurationMs).toBe(25);
    expect(summary.byType['verify-command']).toBe(2);
    expect(summary.byGate['2']).toBe(2);
    expect(summary.rangeFrom).toBe('2026-01-01');
    expect(summary.rangeTo).toBe('2026-01-04');
  });
});
