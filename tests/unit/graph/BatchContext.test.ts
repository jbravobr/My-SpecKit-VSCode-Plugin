import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchContext } from '../../../src/graph/BatchContext';

function graphBatchConfiguration(): vscode.WorkspaceConfiguration {
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined => {
      if (key === 'windowMs') {
        return 10 as T;
      }
      if (key === 'concurrency') {
        return 2 as T;
      }
      return defaultValue;
    },
  } as unknown as vscode.WorkspaceConfiguration;
}

describe('BatchContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(graphBatchConfiguration());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('enqueue + flush processes queued paths after the batch window', async () => {
    const batch = new BatchContext();
    const processed: string[] = [];

    batch.enqueue('src/a.ts');
    const flushPromise = batch.flush(async (filePath) => {
      processed.push(filePath);
    });

    expect(processed).toEqual([]);
    await vi.advanceTimersByTimeAsync(10);
    await flushPromise;

    expect(processed).toEqual(['src/a.ts']);
    expect(batch.size()).toBe(0);
  });

  it('coalesces duplicated paths inside the short window', async () => {
    const batch = new BatchContext({ windowMs: 10, concurrency: 4 });
    const processed: string[] = [];

    batch.enqueue('src/a.ts');
    await vi.advanceTimersByTimeAsync(5);
    batch.enqueue('src/b.ts');
    batch.enqueue('src/a.ts');
    const flushPromise = batch.flush(async (filePath) => {
      processed.push(filePath);
    });

    await vi.advanceTimersByTimeAsync(9);
    expect(processed).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await flushPromise;

    expect(processed.sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('caps parallel extraction by configured concurrency', async () => {
    const batch = new BatchContext({ windowMs: 1, concurrency: 2 });
    let active = 0;
    let maxActive = 0;
    const processed: string[] = [];

    for (const filePath of ['1.ts', '2.ts', '3.ts', '4.ts', '5.ts']) {
      batch.enqueue(filePath);
    }

    const flushPromise = batch.flush(async (filePath) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      processed.push(filePath);
      active -= 1;
    });

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(30);
    await flushPromise;

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(processed).toHaveLength(5);
  });

  it('clear removes queued paths and releases a pending flush', async () => {
    const batch = new BatchContext({ windowMs: 10, concurrency: 2 });
    const processed: string[] = [];

    batch.enqueue('src/a.ts');
    const flushPromise = batch.flush(async (filePath) => {
      processed.push(filePath);
    });
    batch.clear();
    await flushPromise;

    expect(batch.size()).toBe(0);
    expect(processed).toEqual([]);
  });
});
