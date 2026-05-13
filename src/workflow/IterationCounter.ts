import * as path from 'path';
import type { IFileSystem } from '../generator/utils/IFileSystem';
import type { Gate } from '../story/Story';

export interface CounterFile {
  perGate: Record<string, number>;
  updatedAt: string;
}

export interface CounterCheckResult {
  count: number;
  blocked: boolean;
  limit: number;
}

const DEFAULT_LIMIT = 5;

function counterPath(workspaceRoot: string, specId: string): string {
  return path.posix.join(
    workspaceRoot.replace(/\\/g, '/'),
    '.speckit/state/iteration-counters',
    `${specId}.json`,
  );
}

async function readCounter(fs: IFileSystem, file: string): Promise<CounterFile> {
  try {
    if (!(await fs.fileExists(file))) {
      return { perGate: {}, updatedAt: new Date().toISOString() };
    }
    const raw = await fs.readFile(file);
    const parsed = JSON.parse(raw) as CounterFile;
    if (typeof parsed !== 'object' || !parsed || typeof parsed.perGate !== 'object') {
      return { perGate: {}, updatedAt: new Date().toISOString() };
    }
    return parsed;
  } catch {
    return { perGate: {}, updatedAt: new Date().toISOString() };
  }
}

async function writeCounter(fs: IFileSystem, file: string, data: CounterFile): Promise<void> {
  await fs.ensureDir(path.posix.dirname(file));
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export class IterationCounter {
  constructor(
    private readonly fs: IFileSystem,
    private readonly workspaceRoot: string,
    private readonly limit: number = DEFAULT_LIMIT,
  ) {}

  async increment(specId: string, gate: Gate): Promise<CounterCheckResult> {
    const file = counterPath(this.workspaceRoot, specId);
    const data = await readCounter(this.fs, file);
    const key = String(gate);
    data.perGate[key] = (data.perGate[key] ?? 0) + 1;
    data.updatedAt = new Date().toISOString();
    await writeCounter(this.fs, file, data);
    const count = data.perGate[key];
    return { count, blocked: count > this.limit, limit: this.limit };
  }

  async get(specId: string, gate: Gate): Promise<CounterCheckResult> {
    const file = counterPath(this.workspaceRoot, specId);
    const data = await readCounter(this.fs, file);
    const count = data.perGate[String(gate)] ?? 0;
    return { count, blocked: count > this.limit, limit: this.limit };
  }

  async reset(specId: string, gate?: Gate): Promise<void> {
    const file = counterPath(this.workspaceRoot, specId);
    const data = await readCounter(this.fs, file);
    if (gate === undefined) {
      data.perGate = {};
    } else {
      delete data.perGate[String(gate)];
    }
    data.updatedAt = new Date().toISOString();
    await writeCounter(this.fs, file, data);
  }
}
