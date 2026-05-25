import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GraphFreshnessGate } from '../../../src/graph/GraphFreshnessGate';
import { GraphStore } from '../../../src/graph/GraphStore';
import type { GraphMeta } from '../../../src/graph/types';

const workspaceRoot = path.join(process.cwd(), '.speckit-test-artifacts', 'graph-freshness-gate');
const currentHeadSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const staleGraphSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

interface FakeStoreState {
  exists: boolean;
  meta: GraphMeta | null;
  getMetaCalls: number;
  getMetaDelayMs?: number;
}

class FakeGraphStore extends GraphStore {
  constructor(private readonly state: FakeStoreState) {
    super();
  }

  override exists(workspaceRootValue: string): Promise<boolean> {
    void workspaceRootValue;
    return Promise.resolve(this.state.exists);
  }

  override async getMeta(workspaceRootValue: string): Promise<GraphMeta | null> {
    void workspaceRootValue;
    this.state.getMetaCalls += 1;
    if (this.state.getMetaDelayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, this.state.getMetaDelayMs));
    }
    return this.state.meta;
  }
}

function createMeta(headSha: string): GraphMeta {
  return {
    headSha,
    builtAt: '2026-01-01T00:00:00.000Z',
    perFileHash: {},
    perFileMtime: {},
    partialLanguages: [],
  };
}

function createConfig(enabled: boolean, budgetMs = 300): vscode.WorkspaceConfiguration {
  return {
    get: <T>(section: string, defaultValue?: T): T | undefined => {
      if (section === 'enabled') {
        return enabled as T;
      }
      if (section === 'gate.budgetMs') {
        return budgetMs as T;
      }
      return defaultValue;
    },
    has: (section: string): boolean => section === 'enabled' || section === 'gate.budgetMs',
    inspect: (section: string) => {
      void section;
      return undefined;
    },
    update: (section: string, value: unknown): Thenable<void> => {
      void section;
      void value;
      return Promise.resolve();
    },
  };
}

function configureWorkspace(enabled: boolean, supportedCode: boolean): void {
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(createConfig(enabled));
  vi.mocked(vscode.workspace.findFiles).mockResolvedValue(
    supportedCode ? [vscode.Uri.file(path.join(workspaceRoot, 'src', 'sample.ts'))] : [],
  );
}

async function writeHead(sha: string): Promise<void> {
  const refDirectory = path.join(workspaceRoot, '.git', 'refs', 'heads');
  await mkdir(refDirectory, { recursive: true });
  await writeFile(path.join(workspaceRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
  await writeFile(path.join(refDirectory, 'main'), `${sha}\n`, 'utf8');
}

async function writeDetachedHead(sha: string): Promise<void> {
  await mkdir(path.join(workspaceRoot, '.git'), { recursive: true });
  await writeFile(path.join(workspaceRoot, '.git', 'HEAD'), `${sha}\n`, 'utf8');
}

async function writePackedHead(sha: string): Promise<void> {
  await mkdir(path.join(workspaceRoot, '.git'), { recursive: true });
  await writeFile(path.join(workspaceRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
  await writeFile(
    path.join(workspaceRoot, '.git', 'packed-refs'),
    `# pack-refs\n${sha} refs/heads/main\n`,
    'utf8',
  );
}

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('GraphFreshnessGate', () => {
  it('returns no-op when graph is disabled', async () => {
    const state: FakeStoreState = {
      exists: true,
      meta: createMeta(currentHeadSha),
      getMetaCalls: 0,
    };
    configureWorkspace(false, true);

    const result = await new GraphFreshnessGate(new FakeGraphStore(state)).ensure(workspaceRoot);

    expect(result).toEqual({ status: 'no-op', durationMs: 0 });
    expect(state.getMetaCalls).toBe(0);
    expect(vscode.workspace.findFiles).not.toHaveBeenCalled();
  });

  it('returns no-op when graph is missing and no supported code exists', async () => {
    const state: FakeStoreState = { exists: false, meta: null, getMetaCalls: 0 };
    configureWorkspace(true, false);

    const result = await new GraphFreshnessGate(new FakeGraphStore(state)).ensure(workspaceRoot);

    expect(result).toEqual({ status: 'no-op', durationMs: 0 });
    expect(state.getMetaCalls).toBe(0);
    expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
      '**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs,java,py,cs}',
      '**/{node_modules,dist,out,coverage}/**',
      1,
    );
  });

  it('returns stale-async when graph is missing but supported code exists', async () => {
    const reasons: string[] = [];
    const state: FakeStoreState = { exists: false, meta: null, getMetaCalls: 0 };
    configureWorkspace(true, true);

    const result = await new GraphFreshnessGate(new FakeGraphStore(state), (reason) =>
      reasons.push(reason),
    ).ensure(workspaceRoot);

    expect(result.status).toBe('stale-async');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.warning).toContain('GRAPH_STALE_WARNING');
    expect(result.warning).toContain('está ausente');
    expect(reasons).toEqual(['missing']);
    expect(state.getMetaCalls).toBe(1);
  });

  it('returns fresh when graph metadata head matches current git head', async () => {
    const state: FakeStoreState = {
      exists: true,
      meta: createMeta(currentHeadSha),
      getMetaCalls: 0,
    };
    configureWorkspace(true, false);
    await writeHead(currentHeadSha);

    const result = await new GraphFreshnessGate(new FakeGraphStore(state)).ensure(workspaceRoot);

    expect(result.status).toBe('fresh');
    expect(result.warning).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns stale-async and notifies when metadata head differs from current git head', async () => {
    const reasons: string[] = [];
    const state: FakeStoreState = {
      exists: true,
      meta: createMeta(staleGraphSha),
      getMetaCalls: 0,
    };
    configureWorkspace(true, false);
    await writeHead(currentHeadSha);

    const result = await new GraphFreshnessGate(new FakeGraphStore(state), (reason) =>
      reasons.push(reason),
    ).ensure(workspaceRoot);

    expect(result.status).toBe('stale-async');
    expect(result.warning).toContain('GRAPH_STALE_WARNING');
    expect(result.warning).toContain('aaaaaaaaaaaa');
    expect(result.warning).toContain('bbbbbbbbbbbb');
    expect(reasons).toEqual(['headDrift']);
  });

  it('resolves detached HEAD and packed refs before deciding freshness', async () => {
    const detachedState: FakeStoreState = {
      exists: true,
      meta: createMeta(currentHeadSha),
      getMetaCalls: 0,
    };
    configureWorkspace(true, false);
    await writeDetachedHead(currentHeadSha);

    await expect(
      new GraphFreshnessGate(new FakeGraphStore(detachedState)).ensure(workspaceRoot),
    ).resolves.toMatchObject({ status: 'fresh' });

    await rm(workspaceRoot, { recursive: true, force: true });
    const packedState: FakeStoreState = {
      exists: true,
      meta: createMeta(currentHeadSha),
      getMetaCalls: 0,
    };
    configureWorkspace(true, false);
    await writePackedHead(currentHeadSha);

    await expect(
      new GraphFreshnessGate(new FakeGraphStore(packedState)).ensure(workspaceRoot),
    ).resolves.toMatchObject({ status: 'fresh' });
  });

  it('treats an unreadable HEAD as stale and warns when budget is exceeded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reasons: string[] = [];
    const state: FakeStoreState = {
      exists: true,
      meta: createMeta(currentHeadSha),
      getMetaCalls: 0,
      getMetaDelayMs: 5,
    };
    configureWorkspace(true, false);

    const result = await new GraphFreshnessGate(new FakeGraphStore(state), (reason) =>
      reasons.push(reason),
    ).ensure(workspaceRoot, { budgetMs: 1, commandName: 'validate' });

    expect(result.status).toBe('stale-async');
    expect(result.warning).toContain('HEAD está em desconhecido');
    expect(reasons).toEqual(['headDrift']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('for validate'));
  });
});
