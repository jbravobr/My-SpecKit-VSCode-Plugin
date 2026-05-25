import { describe, expect, it } from 'vitest';
import { GraphQuery } from '../../../src/graph/GraphQuery';
import { SubgraphEmbedder } from '../../../src/graph/SubgraphEmbedder';
import type { Graph } from '../../../src/graph/types';

function createGraph(overrides?: Partial<Graph>): Graph {
  return {
    schemaVersion: '1.0.0',
    pluginVersion: '0.7.0',
    extractorVersions: { typescript: '1' },
    meta: {
      headSha: 'abcdef1234567890',
      lastGateSha: '1234567890abcdef',
      builtAt: '2025-01-15T10:00:00Z',
      perFileHash: {},
      perFileMtime: {},
      partialLanguages: [],
    },
    nodes: [
      { id: 'src/app.ts', language: 'typescript', symbols: ['App'] },
      { id: 'src/auth/service.ts', language: 'typescript', symbols: ['AuthService'] },
      { id: 'src/auth/repository.ts', language: 'typescript', symbols: ['AuthRepository'] },
      { id: 'src/events/EventBus.ts', language: 'typescript', symbols: ['EventBus'] },
      { id: 'src/domain/User.ts', language: 'typescript', symbols: ['User'] },
      { id: 'src/ui/Login.tsx', language: 'typescript', symbols: ['Login'] },
    ],
    edges: [
      {
        from: 'src/app.ts',
        to: 'src/auth/service.ts',
        kind: 'IMPORTS',
        edgeKind: 'named',
        confidence: 'EXTRACTED',
        sourceExtractor: 'typescript',
      },
      {
        from: 'src/ui/Login.tsx',
        to: 'src/auth/service.ts',
        kind: 'IMPORTS',
        edgeKind: 'default',
        confidence: 'INFERRED',
        sourceExtractor: 'typescript',
      },
      {
        from: 'src/auth/service.ts',
        to: 'src/auth/repository.ts',
        kind: 'IMPORTS',
        edgeKind: 'named',
        confidence: 'EXTRACTED',
        sourceExtractor: 'typescript',
      },
      {
        from: 'src/auth/service.ts',
        to: 'src/events/EventBus.ts',
        kind: 'INSTANTIATES',
        confidence: 'AMBIGUOUS',
        sourceExtractor: 'typescript',
      },
      {
        from: 'src/auth/repository.ts',
        to: 'src/domain/User.ts',
        kind: 'INHERITS',
        confidence: 'EXTRACTED',
        sourceExtractor: 'typescript',
      },
    ],
    ...overrides,
  };
}

function generate(graph: Graph, options?: Parameters<SubgraphEmbedder['generate']>[0]): string {
  return new SubgraphEmbedder(graph, new GraphQuery(graph)).generate(options);
}

describe('SubgraphEmbedder', () => {
  it('generates header, top nodes, and fan counts with normalized paths', () => {
    const block = generate(createGraph(), { topN: 4 });

    expect(block).toContain('## GRAPH CONTEXT (.speckit/graph.json @ abcdef1)');
    expect(block).toContain('### Top dependências (risco fan-in+fan-out)');
    expect(block).toContain('- `src/auth/service.ts` — fanIn=2 fanOut=2');
    expect(block).toContain('- `src/auth/repository.ts` — fanIn=1 fanOut=1');
    expect(block).not.toContain('src\\auth');
  });

  it('includes story neighbors when story entities are provided', () => {
    const block = generate(createGraph(), { topN: 3, storyEntities: ['AuthService'] });

    expect(block).toContain('### Vizinhos da story');
    expect(block).toContain('`src/auth/service.ts`');
    expect(block).toContain('`src/app.ts` → `src/auth/service.ts`');
  });

  it('omits opt-in annotations when attributes are empty', () => {
    const block = generate(createGraph(), { storyEntities: ['AuthService'], attributes: [] });

    expect(block).not.toContain('[confidence=');
    expect(block).not.toContain('risk=');
    expect(block).not.toContain('[IMPORTS]');
  });

  it('includes every opt-in annotation when all attributes are enabled', () => {
    const block = generate(createGraph(), {
      storyEntities: ['AuthService'],
      attributes: ['confidence', 'riskScore', 'edgeKind', 'diffSinceLastGate'],
    });

    expect(block).toContain('risk=100');
    expect(block).toContain('[IMPORTS]');
    expect(block).toContain('[confidence=EXTRACTED]');
    expect(block).toContain('alterações desde último gate: HEAD=abcdef1 meta.lastGateSha=1234567');
  });

  it('shows a partial language warning when graph coverage is partial', () => {
    const block = generate(
      createGraph({ meta: { ...createGraph().meta, partialLanguages: ['java', 'python'] } }),
    );

    expect(block).toContain('> ⚠️ Cobertura parcial em: java, python.');
  });

  it('returns a minimal block for an empty graph', () => {
    const block = generate(createGraph({ nodes: [], edges: [] }));

    expect(block).toBe(
      '## GRAPH CONTEXT\n\n> Grafo vazio (workspace greenfield ou build pendente).\n',
    );
  });
});
