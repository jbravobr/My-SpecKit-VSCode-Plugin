import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeadFileWatcher } from '../../../src/graph/HeadFileWatcher';

type WatchCallback = () => void;

type WatcherRecord = {
  changes: WatchCallback[];
  creates: WatchCallback[];
  disposed: boolean;
};

const vscodeMock = vi.hoisted(() => {
  const watchers: WatcherRecord[] = [];

  return {
    watchers,
    createFileSystemWatcher: vi.fn(() => {
      const record: WatcherRecord = { changes: [], creates: [], disposed: false };
      watchers.push(record);
      return {
        onDidChange: (callback: WatchCallback) => {
          record.changes.push(callback);
          return { dispose: vi.fn() };
        },
        onDidCreate: (callback: WatchCallback) => {
          record.creates.push(callback);
          return { dispose: vi.fn() };
        },
        onDidDelete: () => ({ dispose: vi.fn() }),
        dispose: () => {
          record.disposed = true;
        },
      };
    }),
  };
});

vi.mock('vscode', () => ({
  workspace: {
    createFileSystemWatcher: vscodeMock.createFileSystemWatcher,
  },
  RelativePattern: class {
    constructor(
      public readonly base: string,
      public readonly pattern: string,
    ) {}
  },
}));

const workspaceRootBase = path.join(process.cwd(), '.speckit-test-artifacts', 'head-file-watcher');
let workspaceRoot: string;
const shaOne = '1111111111111111111111111111111111111111';
const shaTwo = '2222222222222222222222222222222222222222';
const shaThree = '3333333333333333333333333333333333333333';

async function writeHeadRef(sha: string, branch = 'main'): Promise<void> {
  await mkdir(path.join(workspaceRoot, '.git', 'refs', 'heads'), { recursive: true });
  await writeFile(path.join(workspaceRoot, '.git', 'HEAD'), `ref: refs/heads/${branch}\n`, 'utf8');
  await writeFile(path.join(workspaceRoot, '.git', 'refs', 'heads', branch), `${sha}\n`, 'utf8');
}

async function waitForWatcherIo(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25));
}

async function triggerRefChange(): Promise<void> {
  const refsWatcher = vscodeMock.watchers[1];
  expect(refsWatcher).toBeDefined();
  refsWatcher?.changes.forEach((callback) => callback());
  await waitForWatcherIo();
}

describe('HeadFileWatcher', () => {
  beforeEach(async () => {
    workspaceRoot = path.join(workspaceRootBase, randomUUID());
    vscodeMock.watchers.length = 0;
    vscodeMock.createFileSystemWatcher.mockClear();
    await rm(workspaceRoot, { recursive: true, force: true });
    await writeHeadRef(shaOne);
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
  });

  it('resolves symbolic refs and emits the previous and new SHA when it changes', async () => {
    const onHeadChange = vi.fn<(prevSha: string | null, newSha: string) => void>();
    const watcher = new HeadFileWatcher(workspaceRoot, onHeadChange);

    watcher.start();
    await waitForWatcherIo();
    await writeHeadRef(shaTwo);
    await triggerRefChange();

    expect(onHeadChange).toHaveBeenCalledTimes(1);
    expect(onHeadChange).toHaveBeenCalledWith(shaOne, shaTwo);
    watcher.dispose();
  });

  it('emits only when the resolved SHA changes', async () => {
    const onHeadChange = vi.fn<(prevSha: string | null, newSha: string) => void>();
    const watcher = new HeadFileWatcher(workspaceRoot, onHeadChange);

    watcher.start();
    await waitForWatcherIo();
    await triggerRefChange();
    await writeHeadRef(shaTwo);
    await triggerRefChange();
    await triggerRefChange();

    expect(onHeadChange).toHaveBeenCalledTimes(1);
    expect(onHeadChange).toHaveBeenCalledWith(shaOne, shaTwo);
    watcher.dispose();
  });

  it('stops emitting after dispose', async () => {
    const onHeadChange = vi.fn<(prevSha: string | null, newSha: string) => void>();
    const watcher = new HeadFileWatcher(workspaceRoot, onHeadChange);

    watcher.start();
    await waitForWatcherIo();
    watcher.dispose();
    await writeHeadRef(shaThree);
    await triggerRefChange();

    expect(onHeadChange).not.toHaveBeenCalled();
    expect(vscodeMock.watchers.every((record) => record.disposed)).toBe(true);
  });
});
