import { describe, it, expect, beforeEach } from 'vitest';
import { IterationCounter } from '../../../src/workflow/IterationCounter';
import type { IFileSystem } from '../../../src/generator/utils/IFileSystem';

function memFs(): IFileSystem {
  const files = new Map<string, string>();
  return {
    ensureDir: async () => {},
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

describe('IterationCounter', () => {
  let fs: IFileSystem;
  beforeEach(() => {
    fs = memFs();
  });

  it('starts with count=0 and blocked=false', async () => {
    const c = new IterationCounter(fs, '/ws');
    const r = await c.get('S1', 2);
    expect(r).toEqual({ count: 0, blocked: false, limit: 5 });
  });

  it('increments per gate independently', async () => {
    const c = new IterationCounter(fs, '/ws');
    await c.increment('S1', 2);
    await c.increment('S1', 2);
    await c.increment('S1', 3);
    expect((await c.get('S1', 2)).count).toBe(2);
    expect((await c.get('S1', 3)).count).toBe(1);
  });

  it('blocks once count exceeds limit', async () => {
    const c = new IterationCounter(fs, '/ws', 2);
    expect((await c.increment('S1', 2)).blocked).toBe(false); // 1
    expect((await c.increment('S1', 2)).blocked).toBe(false); // 2
    expect((await c.increment('S1', 2)).blocked).toBe(true); // 3 > 2
  });

  it('persists state across instances via filesystem', async () => {
    const c1 = new IterationCounter(fs, '/ws');
    await c1.increment('S1', 2);
    const c2 = new IterationCounter(fs, '/ws');
    expect((await c2.get('S1', 2)).count).toBe(1);
  });

  it('reset clears a specific gate', async () => {
    const c = new IterationCounter(fs, '/ws');
    await c.increment('S1', 2);
    await c.increment('S1', 3);
    await c.reset('S1', 2);
    expect((await c.get('S1', 2)).count).toBe(0);
    expect((await c.get('S1', 3)).count).toBe(1);
  });

  it('reset without gate clears all counters for spec', async () => {
    const c = new IterationCounter(fs, '/ws');
    await c.increment('S1', 2);
    await c.increment('S1', 3);
    await c.reset('S1');
    expect((await c.get('S1', 2)).count).toBe(0);
    expect((await c.get('S1', 3)).count).toBe(0);
  });

  it('uses separate files per spec', async () => {
    const c = new IterationCounter(fs, '/ws');
    await c.increment('S1', 2);
    await c.increment('S2', 2);
    expect((await c.get('S1', 2)).count).toBe(1);
    expect((await c.get('S2', 2)).count).toBe(1);
  });

  it('tolerates corrupted counter file (resets gracefully)', async () => {
    await fs.writeFile('/ws/.speckit/state/iteration-counters/S1.json', '{not json');
    const c = new IterationCounter(fs, '/ws');
    const r = await c.get('S1', 2);
    expect(r.count).toBe(0);
  });
});
