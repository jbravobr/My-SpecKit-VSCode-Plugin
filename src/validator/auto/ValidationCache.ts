import * as crypto from 'crypto';
import * as path from 'path';
import type { IFileSystem } from '../../generator/utils/IFileSystem';

export interface FileMeta {
  hash: string;
  mtimeMs: number;
}

export interface CacheEntry<T = unknown> {
  validatorId: string;
  filePath: string;
  hash: string;
  mtimeMs: number;
  value: T;
  createdAt: string;
}

const CACHE_DIR = path.join('.speckit', 'cache', 'validation');

function shortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 32);
}

export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export function buildCacheKey(validatorId: string, filePath: string, meta: FileMeta): string {
  return `${validatorId}|${filePath}|${meta.hash}|${meta.mtimeMs}`;
}

export class ValidationCache {
  constructor(
    private readonly workspaceRoot: string,
    private readonly fs: IFileSystem,
  ) {}

  private cacheDir(): string {
    return path.join(this.workspaceRoot, CACHE_DIR);
  }

  private entryPath(key: string): string {
    return path.join(this.cacheDir(), `${shortHash(key)}.json`);
  }

  async get<T>(validatorId: string, filePath: string, meta: FileMeta): Promise<T | undefined> {
    const key = buildCacheKey(validatorId, filePath, meta);
    const file = this.entryPath(key);
    if (!(await this.fs.fileExists(file))) return undefined;
    try {
      const raw = await this.fs.readFile(file);
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      if (
        parsed.validatorId !== validatorId ||
        parsed.filePath !== filePath ||
        parsed.hash !== meta.hash ||
        parsed.mtimeMs !== meta.mtimeMs
      ) {
        return undefined;
      }
      return parsed.value;
    } catch {
      return undefined;
    }
  }

  async set<T>(validatorId: string, filePath: string, meta: FileMeta, value: T): Promise<void> {
    await this.fs.ensureDir(this.cacheDir());
    const key = buildCacheKey(validatorId, filePath, meta);
    const entry: CacheEntry<T> = {
      validatorId,
      filePath,
      hash: meta.hash,
      mtimeMs: meta.mtimeMs,
      value,
      createdAt: new Date().toISOString(),
    };
    await this.fs.writeFile(this.entryPath(key), JSON.stringify(entry, null, 2));
  }

  async invalidateFile(filePath: string): Promise<void> {
    const dir = this.cacheDir();
    if (!(await this.fs.fileExists(dir))) return;
    let entries: string[];
    try {
      entries = await this.fs.listDir(dir);
    } catch {
      return;
    }
    for (const entryName of entries) {
      if (!entryName.endsWith('.json')) continue;
      const full = path.join(dir, entryName);
      try {
        const raw = await this.fs.readFile(full);
        const parsed = JSON.parse(raw) as CacheEntry;
        if (parsed.filePath === filePath) {
          await this.fs.deleteFile(full);
        }
      } catch {
        // ignore unreadable entries
      }
    }
  }

  async clear(): Promise<void> {
    const dir = this.cacheDir();
    if (await this.fs.fileExists(dir)) {
      await this.fs.deleteDir(dir);
    }
  }
}
