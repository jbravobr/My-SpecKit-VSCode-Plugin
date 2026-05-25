import { describe, expect, it } from 'vitest';
import { GraphQuery } from '../../../src/graph/GraphQuery';
import type { Graph, GraphEdge, GraphNode } from '../../../src/graph/types';

function edge(from: string, to: string, kind: GraphEdge['kind']): GraphEdge {
  return {
    from,
    to,
    kind,
    confidence: 'EXTRACTED',
    sourceExtractor: 'fixture',
  };
}

function node(id: string, symbols: string[]): GraphNode {
  return { id, language: 'typescript', symbols };
}

function makeGraph(): Graph {
  return {
    schemaVersion: '1.0.0',
    pluginVersion: '0.7.0',
    extractorVersions: { typescript: '1' },
    meta: {
      headSha: 'head',
      builtAt: '2026-01-01T00:00:00.000Z',
      perFileHash: {},
      perFileMtime: {},
      partialLanguages: [],
    },
    nodes: [
      node('src/A.ts', ['Alpha']),
      node('src/B.ts', ['Beta']),
      node('src/C.ts', ['Gamma']),
      node('src/D.ts', ['Delta']),
      node('src/E.ts', ['Echo']),
    ],
    edges: [
      edge('src/A.ts', 'src/B.ts', 'IMPORTS'),
      edge('src/A.ts', 'src/C.ts', 'IMPORTS'),
      edge('src/D.ts', 'src/A.ts', 'IMPORTS'),
      edge('src/E.ts', 'src/A.ts', 'INHERITS'),
      edge('src/C.ts', 'src/A.ts', 'INSTANTIATES'),
    ],
  };
}

describe('GraphQuery', () => {
  it('resolves symbol roots and returns deterministic topN one-hop neighbors with root preserved', () => {
    const query = new GraphQuery(makeGraph());

    const result = query.neighbors(['Alpha'], { topN: 3 });

    expect(result.nodes.map((item) => item.id)).toEqual(['src/A.ts', 'src/B.ts', 'src/C.ts']);
    expect(result.edges.map((item) => `${item.from}->${item.to}:${item.kind}`)).toEqual([
      'src/A.ts->src/B.ts:IMPORTS',
      'src/A.ts->src/C.ts:IMPORTS',
      'src/C.ts->src/A.ts:INSTANTIATES',
    ]);
  });

  it('supports multi-hop traversal from normalized path ids', () => {
    const query = new GraphQuery(makeGraph());

    const result = query.neighbors(['src\\B.ts'], { hops: 2, topN: 20 });

    expect(result.nodes.map((item) => item.id)).toEqual([
      'src/A.ts',
      'src/B.ts',
      'src/C.ts',
      'src/D.ts',
      'src/E.ts',
    ]);
    expect(result.edges).toHaveLength(5);
  });

  it('normalizes riskScore to the highest raw risk in the graph', () => {
    const query = new GraphQuery(makeGraph());

    expect(query.riskScore('src/A.ts')).toBe(100);
    expect(query.riskScore('src/B.ts')).toBe(20);
    expect(query.riskScore('src/E.ts')).toBe(0);
    expect(query.riskScore('missing.ts')).toBe(0);
  });

  it('returns top risk nodes ordered by risk descending and id tie-break', () => {
    const query = new GraphQuery(makeGraph());

    expect(query.topRiskNodes(4).map((item) => item.id)).toEqual([
      'src/A.ts',
      'src/B.ts',
      'src/C.ts',
      'src/D.ts',
    ]);
  });

  it('returns empty subgraph and zero risk for an empty graph', () => {
    const graph = makeGraph();
    const query = new GraphQuery({ ...graph, nodes: [], edges: [] });

    expect(query.neighbors(['Alpha'])).toEqual({ nodes: [], edges: [] });
    expect(query.riskScore('src/A.ts')).toBe(0);
    expect(query.topRiskNodes(5)).toEqual([]);
  });
});
