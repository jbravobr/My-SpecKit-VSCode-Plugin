import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLUGIN_VERSION_GRAPH, SCHEMA_VERSION } from '../../../src/graph/constants';
import { GraphStore } from '../../../src/graph/GraphStore';
import type { Graph } from '../../../src/graph/types';

const workspaceRoot = path.join(process.cwd(), '.speckit-test-artifacts', 'graph-store');

function makeGraph(): Graph {
  return {
    schemaVersion: SCHEMA_VERSION,
    pluginVersion: PLUGIN_VERSION_GRAPH,
    extractorVersions: { typescript: '1.0.0' },
    meta: {
      headSha: 'abc123',
      builtAt: '2026-01-01T00:00:00.000Z',
      perFileHash: { 'src\\a.ts': 'hash-a' },
      perFileMtime: { 'src\\a.ts': 1 },
      partialLanguages: ['typescript'],
    },
    nodes: [{ id: 'src\\a.ts', language: 'typescript', symbols: ['A'] }],
    edges: [
      {
        from: 'src\\a.ts',
        to: 'src\\b.ts',
        kind: 'IMPORTS',
        confidence: 'EXTRACTED',
        sourceExtractor: 'typescript',
      },
    ],
  };
}

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('GraphStore', () => {
  it('saves normalized graph JSON and loads it back', async () => {
    const store = new GraphStore();
    const graph = makeGraph();

    await store.save(workspaceRoot, graph);
    const raw = await readFile(path.join(workspaceRoot, '.speckit', 'graph.json'), 'utf8');
    const loaded = await store.load(workspaceRoot);

    const persisted = JSON.parse(raw) as Graph;
    expect(raw.endsWith('\n')).toBe(true);
    expect(persisted.meta.perFileHash).toEqual({ 'src/a.ts': 'hash-a' });
    expect(persisted.meta.perFileMtime).toEqual({ 'src/a.ts': 1 });
    expect(persisted.nodes[0]?.id).toBe('src/a.ts');
    expect(persisted.edges[0]?.from).toBe('src/a.ts');
    expect(persisted.edges[0]?.to).toBe('src/b.ts');
    expect(loaded).toEqual(persisted);
  });

  it('returns metadata and existence status for a persisted graph', async () => {
    const store = new GraphStore();
    const graph = makeGraph();

    expect(await store.exists(workspaceRoot)).toBe(false);
    await store.save(workspaceRoot, graph);

    expect(await store.exists(workspaceRoot)).toBe(true);
    expect(await store.getMeta(workspaceRoot)).toEqual({
      ...graph.meta,
      perFileHash: { 'src/a.ts': 'hash-a' },
      perFileMtime: { 'src/a.ts': 1 },
    });
  });

  it('returns null and warns when JSON is invalid', async () => {
    const store = new GraphStore();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await mkdir(path.join(workspaceRoot, '.speckit'), { recursive: true });
    await writeFile(path.join(workspaceRoot, '.speckit', 'graph.json'), '{ invalid', 'utf8');

    await expect(store.load(workspaceRoot)).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('rejects incompatible schema major versions', () => {
    const store = new GraphStore();
    const graph = { ...makeGraph(), schemaVersion: '2.0.0' };

    const result = store.validate(graph);

    expect(result).toEqual({
      ok: false,
      reason: 'schema mismatch: unsupported schemaVersion 2.0.0',
    });
  });

  it('rejects graphs without array nodes and edges', () => {
    const store = new GraphStore();
    const graph: Record<string, unknown> = { ...makeGraph(), nodes: {}, edges: {} };

    const result = store.validate(graph);

    expect(result).toEqual({ ok: false, reason: 'schema mismatch: nodes must be an array' });
  });
});
