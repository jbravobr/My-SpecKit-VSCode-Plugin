import { describe, it, expect, beforeEach } from 'vitest';
import {
  ValidationCache,
  buildCacheKey,
  computeContentHash,
} from '../../../../src/validator/auto/ValidationCache';
import type { IFileSystem } from '../../../../src/generator/utils/IFileSystem';

class InMemoryFs implements IFileSystem {
  files = new Map<string, string>();
  dirs = new Set<string>();

  async ensureDir(dirPath: string): Promise<void> {
    this.dirs.add(this.norm(dirPath));
  }
  async writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(this.norm(filePath), content);
  }
  async readFile(filePath: string): Promise<string> {
    const content = this.files.get(this.norm(filePath));
    if (content === undefined) throw new Error(`ENOENT: ${filePath}`);
    return content;
  }
  async fileExists(filePath: string): Promise<boolean> {
    const n = this.norm(filePath);
    return this.files.has(n) || this.dirs.has(n);
  }
  async listDir(dirPath: string): Promise<string[]> {
    const prefix = this.norm(dirPath) + '/';
    const out: string[] = [];
    for (const f of this.files.keys()) {
      if (f.startsWith(prefix)) {
        const rest = f.slice(prefix.length);
        if (!rest.includes('/')) out.push(rest);
      }
    }
    return out;
  }
  async deleteFile(filePath: string): Promise<void> {
    this.files.delete(this.norm(filePath));
  }
  async deleteDir(dirPath: string): Promise<void> {
    const prefix = this.norm(dirPath) + '/';
    for (const f of [...this.files.keys()]) {
      if (f.startsWith(prefix) || f === this.norm(dirPath)) this.files.delete(f);
    }
    this.dirs.delete(this.norm(dirPath));
  }
  private norm(p: string): string {
    return p.replace(/\\/g, '/');
  }
}

describe('ValidationCache helpers', () => {
  it('computeContentHash is deterministic and short', () => {
    const h1 = computeContentHash('hello world');
    const h2 = computeContentHash('hello world');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
  });

  it('buildCacheKey concatenates fields', () => {
    const key = buildCacheKey('v1', '/a/b.ts', { hash: 'abc', mtimeMs: 1234 });
    expect(key).toBe('v1|/a/b.ts|abc|1234');
  });
});

describe('ValidationCache', () => {
  let fs: InMemoryFs;
  let cache: ValidationCache;

  beforeEach(() => {
    fs = new InMemoryFs();
    cache = new ValidationCache('/ws', fs);
  });

  it('returns undefined when entry does not exist', async () => {
    const result = await cache.get('v1', '/ws/a.ts', { hash: 'h', mtimeMs: 1 });
    expect(result).toBeUndefined();
  });

  it('stores and retrieves a value by exact meta', async () => {
    const meta = { hash: 'h1', mtimeMs: 100 };
    await cache.set('v1', '/ws/a.ts', meta, { crap: 12 });
    const result = await cache.get<{ crap: number }>('v1', '/ws/a.ts', meta);
    expect(result).toEqual({ crap: 12 });
  });

  it('misses when hash changes', async () => {
    await cache.set('v1', '/ws/a.ts', { hash: 'h1', mtimeMs: 100 }, { v: 1 });
    const result = await cache.get('v1', '/ws/a.ts', { hash: 'h2', mtimeMs: 100 });
    expect(result).toBeUndefined();
  });

  it('misses when mtime changes', async () => {
    await cache.set('v1', '/ws/a.ts', { hash: 'h1', mtimeMs: 100 }, { v: 1 });
    const result = await cache.get('v1', '/ws/a.ts', { hash: 'h1', mtimeMs: 200 });
    expect(result).toBeUndefined();
  });

  it('isolates entries per validator id', async () => {
    const meta = { hash: 'h', mtimeMs: 1 };
    await cache.set('v1', '/ws/a.ts', meta, 'one');
    await cache.set('v2', '/ws/a.ts', meta, 'two');
    expect(await cache.get('v1', '/ws/a.ts', meta)).toBe('one');
    expect(await cache.get('v2', '/ws/a.ts', meta)).toBe('two');
  });

  it('invalidateFile removes only entries for the given path', async () => {
    const meta = { hash: 'h', mtimeMs: 1 };
    await cache.set('v1', '/ws/a.ts', meta, 1);
    await cache.set('v2', '/ws/a.ts', meta, 2);
    await cache.set('v1', '/ws/b.ts', meta, 3);
    await cache.invalidateFile('/ws/a.ts');
    expect(await cache.get('v1', '/ws/a.ts', meta)).toBeUndefined();
    expect(await cache.get('v2', '/ws/a.ts', meta)).toBeUndefined();
    expect(await cache.get('v1', '/ws/b.ts', meta)).toBe(3);
  });

  it('invalidateFile is a no-op when cache dir does not exist', async () => {
    await expect(cache.invalidateFile('/ws/a.ts')).resolves.toBeUndefined();
  });

  it('clear removes the entire cache dir', async () => {
    const meta = { hash: 'h', mtimeMs: 1 };
    await cache.set('v1', '/ws/a.ts', meta, 1);
    await cache.clear();
    expect(await cache.get('v1', '/ws/a.ts', meta)).toBeUndefined();
  });

  it('returns undefined on corrupted entry json', async () => {
    const meta = { hash: 'h', mtimeMs: 1 };
    await cache.set('v1', '/ws/a.ts', meta, 1);
    // corrupt every entry file
    for (const k of [...fs.files.keys()]) {
      if (k.endsWith('.json')) fs.files.set(k, '{not valid json');
    }
    expect(await cache.get('v1', '/ws/a.ts', meta)).toBeUndefined();
  });
});
