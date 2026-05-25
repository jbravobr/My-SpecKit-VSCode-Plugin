import * as vscode from 'vscode';

const DEFAULT_WINDOW_MS = 100;
const DEFAULT_CONCURRENCY = 4;

export interface BatchContextOptions {
  windowMs?: number;
  concurrency?: number;
}

function readConfiguredNumber(key: string, fallback: number): number {
  try {
    return (
      vscode.workspace.getConfiguration('speckit.graph.batch').get<number>(key, fallback) ??
      fallback
    );
  } catch {
    return fallback;
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

async function runWithConcurrency(
  paths: string[],
  concurrency: number,
  extractFn: (path: string) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, paths.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < paths.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const currentPath = paths[currentIndex];
      if (currentPath !== undefined) {
        await extractFn(currentPath);
      }
    }
  });

  await Promise.all(workers);
}

/**
 * Coalesces short bursts of graph extraction requests before running a bounded batch.
 * Complexity: enqueue/clear/size are O(1); flush is O(n) for n unique paths.
 */
export class BatchContext {
  private readonly pendingPaths = new Set<string>();
  private readonly windowMs: number;
  private readonly concurrency: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private windowPromise: Promise<void> | undefined;
  private resolveWindow: (() => void) | undefined;

  constructor(opts?: BatchContextOptions) {
    this.windowMs = normalizePositiveInteger(
      opts?.windowMs ?? readConfiguredNumber('windowMs', DEFAULT_WINDOW_MS),
      DEFAULT_WINDOW_MS,
    );
    this.concurrency = normalizePositiveInteger(
      opts?.concurrency ?? readConfiguredNumber('concurrency', DEFAULT_CONCURRENCY),
      DEFAULT_CONCURRENCY,
    );
  }

  enqueue(path: string): void {
    this.pendingPaths.add(path);
    this.scheduleWindow();
  }

  async flush(extractFn: (path: string) => Promise<void>): Promise<void> {
    const currentWindow = this.windowPromise;
    if (currentWindow !== undefined) {
      await currentWindow;
    }

    const paths = [...this.pendingPaths];
    this.pendingPaths.clear();

    if (paths.length === 0) {
      return;
    }

    await runWithConcurrency(paths, this.concurrency, extractFn);
  }

  size(): number {
    return this.pendingPaths.size;
  }

  clear(): void {
    this.pendingPaths.clear();
    this.completeWindow();
  }

  private scheduleWindow(): void {
    if (this.windowPromise === undefined) {
      this.windowPromise = new Promise((resolve) => {
        this.resolveWindow = resolve;
      });
    }

    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => this.completeWindow(), this.windowMs);
  }

  private completeWindow(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    const resolve = this.resolveWindow;
    this.resolveWindow = undefined;
    this.windowPromise = undefined;
    resolve?.();
  }
}
