import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleImpactCommand } from '../../../src/participant/commands/impactCommand';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

const token = createMockToken();

function makeGraphJson(nodes: Array<{ id: string; language: string; symbols: string[] }>, edges: Array<{ from: string; to: string; kind: string; confidence: string; sourceExtractor: string }>) {
  return JSON.stringify({
    schemaVersion: '1.0.0',
    pluginVersion: '0.7.0',
    extractorVersions: {},
    meta: {
      headSha: 'abc1234567890abcdef1234567890abcdef123456',
      builtAt: '2026-01-01T00:00:00.000Z',
      perFileHash: {},
      perFileMtime: {},
      partialLanguages: [],
    },
    nodes,
    edges,
  });
}

describe('handleImpactCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows error when no workspace', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    ws.getWorkspaceRoot = () => undefined;

    await handleImpactCommand(createMockRequest(''), stream, token, new InMemoryFileSystem(), ws);

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
  });

  it('shows error when no entity provided and no active file', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(
      'C:/workspace/.speckit/graph.json',
      makeGraphJson(
        [{ id: 'src/a.ts', language: 'typescript', symbols: [] }],
        [],
      ),
    );
    // Also need .git/HEAD for freshness check
    await fs.writeFile('C:/workspace/.git/HEAD', 'ref: refs/heads/main');
    await fs.writeFile('C:/workspace/.git/refs/heads/main', 'abc1234567890abcdef1234567890abcdef123456');
    const ws = new WorkspaceStub();
    ws.getActiveSpecPath = async () => undefined;
    const stream = createMockStream();

    await handleImpactCommand(createMockRequest(''), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Nenhum arquivo ou símbolo fornecido');
  });

  it('shows entity not found when entity is not in graph', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(
      'C:/workspace/.speckit/graph.json',
      makeGraphJson(
        [{ id: 'src/a.ts', language: 'typescript', symbols: [] }],
        [],
      ),
    );
    await fs.writeFile('C:/workspace/.git/HEAD', 'ref: refs/heads/main');
    await fs.writeFile('C:/workspace/.git/refs/heads/main', 'abc1234567890abcdef1234567890abcdef123456');
    const ws = new WorkspaceStub();
    const stream = createMockStream();

    await handleImpactCommand(createMockRequest('src/not-found.ts'), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Nenhum nó encontrado');
  });

  it('renders impact table with risk scores for valid entity', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(
      'C:/workspace/.speckit/graph.json',
      makeGraphJson(
        [
          { id: 'src/a.ts', language: 'typescript', symbols: ['ClassA'] },
          { id: 'src/b.ts', language: 'typescript', symbols: ['ClassB'] },
          { id: 'src/c.ts', language: 'typescript', symbols: ['ClassC'] },
        ],
        [
          { from: 'src/b.ts', to: 'src/a.ts', kind: 'IMPORTS', confidence: 'EXTRACTED', sourceExtractor: 'ts' },
          { from: 'src/c.ts', to: 'src/a.ts', kind: 'IMPORTS', confidence: 'EXTRACTED', sourceExtractor: 'ts' },
        ],
      ),
    );
    await fs.writeFile('C:/workspace/.git/HEAD', 'ref: refs/heads/main');
    await fs.writeFile('C:/workspace/.git/refs/heads/main', 'abc1234567890abcdef1234567890abcdef123456');
    const ws = new WorkspaceStub();
    const stream = createMockStream();

    await handleImpactCommand(createMockRequest('src/a.ts'), stream, token, fs, ws);

    const md = stream.getAllMarkdown();
    expect(md).toContain('Impact Analysis');
    expect(md).toContain('src/a.ts');
    expect(md).toContain('Risk Score:');
    expect(md).toContain('Nós afetados');
    expect(md).toContain('src/b.ts');
    expect(md).toContain('src/c.ts');
  });

  it('uses active file when no prompt provided', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(
      'C:/workspace/.speckit/graph.json',
      makeGraphJson(
        [
          { id: 'src/main.ts', language: 'typescript', symbols: ['Main'] },
          { id: 'src/dep.ts', language: 'typescript', symbols: ['Dep'] },
        ],
        [
          { from: 'src/main.ts', to: 'src/dep.ts', kind: 'IMPORTS', confidence: 'EXTRACTED', sourceExtractor: 'ts' },
        ],
      ),
    );
    await fs.writeFile('C:/workspace/.git/HEAD', 'ref: refs/heads/main');
    await fs.writeFile('C:/workspace/.git/refs/heads/main', 'abc1234567890abcdef1234567890abcdef123456');
    const ws = new WorkspaceStub();
    ws.getActiveSpecPath = async () => 'C:/workspace/src/main.ts';
    const stream = createMockStream();

    await handleImpactCommand(createMockRequest(''), stream, token, fs, ws);

    const md = stream.getAllMarkdown();
    expect(md).toContain('Impact Analysis');
    expect(md).toContain('src/main.ts');
  });

  it('shows graceful message when graph build fails', async () => {
    const fs = new InMemoryFileSystem();
    // No graph.json AND no source files → build will fail or produce empty graph
    // The ensureGraphExists returns error when build fails
    // Since GraphBuilder.build() needs real files, with InMemoryFileSystem it will fail gracefully
    const ws = new WorkspaceStub();
    const stream = createMockStream();

    await handleImpactCommand(createMockRequest('src/a.ts'), stream, token, fs, ws);

    const md = stream.getAllMarkdown();
    // Should either show graph unavailable or entity not found (both are graceful)
    expect(md.includes('Graph indisponível') || md.includes('Nenhum nó encontrado') || md.includes('Graph não encontrado')).toBe(true);
  });
});
