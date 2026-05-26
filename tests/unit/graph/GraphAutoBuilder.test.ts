import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GraphAutoBuilder } from '../../../src/graph/GraphAutoBuilder';
import { PLUGIN_VERSION_GRAPH, SCHEMA_VERSION } from '../../../src/graph/constants';
import { GraphStore } from '../../../src/graph/GraphStore';
import type { Graph } from '../../../src/graph/types';
import type { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import { InMemoryFileSystem } from '../../support/fakes';

const workspaceRoot = path.join('C:', 'workspace', 'graph-auto-builder');
const currentHeadSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const staleHeadSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const builtAt = '2026-01-02T03:04:05.000Z';

interface GraphBuilderStub {
  build(workspaceFolder: string): Promise<Graph>;
}

class FakeGraphBuilder implements GraphBuilderStub {
  buildCalls = 0;

  constructor(private readonly graphFactory: () => Graph) {}

  async build(workspaceFolder: string): Promise<Graph> {
    expect(workspaceFolder).toBe(workspaceRoot);
    this.buildCalls += 1;
    return this.graphFactory();
  }
}

class FailingGraphBuilder implements GraphBuilderStub {
  buildCalls = 0;

  constructor(private readonly message: string) {}

  async build(): Promise<Graph> {
    this.buildCalls += 1;
    throw new Error(this.message);
  }
}

function createGraph(headSha = ''): Graph {
  return {
    schemaVersion: SCHEMA_VERSION,
    pluginVersion: PLUGIN_VERSION_GRAPH,
    extractorVersions: { typescript: '1.0.0' },
    meta: {
      headSha,
      builtAt: '2026-01-01T00:00:00.000Z',
      perFileHash: {},
      perFileMtime: {},
      partialLanguages: [],
    },
    nodes: [{ id: 'src/example.ts', language: 'typescript', symbols: ['Example'] }],
    edges: [],
  };
}

async function writeHead(fs: IFileSystem, sha: string): Promise<void> {
  const refDir = path.join(workspaceRoot, '.git', 'refs', 'heads');
  await fs.ensureDir(refDir);
  await fs.writeFile(path.join(workspaceRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  await fs.writeFile(path.join(refDir, 'main'), `${sha}\n`);
}

describe('GraphAutoBuilder', () => {
  it('skips rebuild when graph already exists and is fresh', async () => {
    const fs = new InMemoryFileSystem();
    const store = new GraphStore('.speckit/graph.json', fs);
    const builder = new FakeGraphBuilder(() => createGraph(currentHeadSha));
    await writeHead(fs, currentHeadSha);
    await store.save(workspaceRoot, createGraph(currentHeadSha));

    const result = await new GraphAutoBuilder(fs, {
      builder,
      store,
      now: () => builtAt,
    }).ensureGraphExists(workspaceRoot);

    expect(result).toEqual({ built: false, fresh: true });
    expect(builder.buildCalls).toBe(0);
    expect(await store.load(workspaceRoot)).toMatchObject({ meta: { headSha: currentHeadSha } });
  });

  it('builds and persists the graph when it does not exist', async () => {
    const fs = new InMemoryFileSystem();
    const store = new GraphStore('.speckit/graph.json', fs);
    const builder = new FakeGraphBuilder(() => createGraph());
    await writeHead(fs, currentHeadSha);

    const result = await new GraphAutoBuilder(fs, {
      builder,
      store,
      now: () => builtAt,
    }).ensureGraphExists(workspaceRoot);

    expect(result).toEqual({ built: true, fresh: true });
    expect(builder.buildCalls).toBe(1);
    expect(await fs.fileExists(path.join(workspaceRoot, '.speckit', 'graph.json'))).toBe(true);
    expect(await store.load(workspaceRoot)).toMatchObject({
      meta: { headSha: currentHeadSha, builtAt },
      nodes: [{ id: 'src/example.ts' }],
    });
  });

  it('rebuilds when the persisted graph is stale', async () => {
    const fs = new InMemoryFileSystem();
    const store = new GraphStore('.speckit/graph.json', fs);
    const builder = new FakeGraphBuilder(() => createGraph());
    await writeHead(fs, currentHeadSha);
    await store.save(workspaceRoot, createGraph(staleHeadSha));

    const result = await new GraphAutoBuilder(fs, {
      builder,
      store,
      now: () => builtAt,
    }).ensureGraphExists(workspaceRoot);

    expect(result).toEqual({ built: true, fresh: true });
    expect(builder.buildCalls).toBe(1);
    expect(await store.load(workspaceRoot)).toMatchObject({ meta: { headSha: currentHeadSha } });
  });

  it('returns a graceful error when the build fails', async () => {
    const fs = new InMemoryFileSystem();
    const store = new GraphStore('.speckit/graph.json', fs);
    const builder = new FailingGraphBuilder('graph build failed');
    await writeHead(fs, currentHeadSha);

    await expect(
      new GraphAutoBuilder(fs, {
        builder,
        store,
      }).ensureGraphExists(workspaceRoot),
    ).resolves.toEqual({
      built: false,
      fresh: false,
      error: 'graph build failed',
    });
    expect(builder.buildCalls).toBe(1);
    expect(await fs.fileExists(path.join(workspaceRoot, '.speckit', 'graph.json'))).toBe(false);
  });
});
