import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleContextCommand } from '../../../src/participant/commands/contextCommand';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

const token = createMockToken();

describe('handleContextCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    ws.getWorkspaceRoot = () => undefined;

    await handleContextCommand(createMockRequest(''), stream, token, new InMemoryFileSystem(), ws);

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
  });

  it('shows empty message when no context files', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    await handleContextCommand(createMockRequest(''), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Nenhum arquivo de contexto');
  });

  it('adds file to context', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    await fs.writeFile('C:/workspace/src/service.ts', 'code');
    const ws = new WorkspaceStub();

    await handleContextCommand(createMockRequest('add src/service.ts'), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Adicionado');
    expect(stream.getAllMarkdown()).toContain('src/service.ts');
  });

  it('blocks path traversal with ".."', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    await handleContextCommand(createMockRequest('add ../secret/file'), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('não é permitido');
  });

  it('rejects non-existent file', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    await handleContextCommand(createMockRequest('add nonexistent.ts'), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Arquivo não encontrado');
  });

  it('reports duplicate add', async () => {
    const stream1 = createMockStream();
    const stream2 = createMockStream();
    const fs = new InMemoryFileSystem();
    await fs.writeFile('C:/workspace/src/a.ts', 'code');
    const ws = new WorkspaceStub();

    await handleContextCommand(createMockRequest('add src/a.ts'), stream1, token, fs, ws);
    await handleContextCommand(createMockRequest('add src/a.ts'), stream2, token, fs, ws);

    expect(stream2.getAllMarkdown()).toContain('Já está no contexto');
  });

  it('lists added files', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('C:/workspace/src/a.ts', 'code');
    await fs.writeFile('C:/workspace/src/b.ts', 'code');
    const ws = new WorkspaceStub();

    const s1 = createMockStream();
    await handleContextCommand(createMockRequest('add src/a.ts'), s1, token, fs, ws);
    const s2 = createMockStream();
    await handleContextCommand(createMockRequest('add src/b.ts'), s2, token, fs, ws);

    const stream = createMockStream();
    await handleContextCommand(createMockRequest('list'), stream, token, fs, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('2 arquivo(s)');
    expect(output).toContain('src/a.ts');
    expect(output).toContain('src/b.ts');
  });

  it('removes file from context', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('C:/workspace/src/a.ts', 'code');
    const ws = new WorkspaceStub();

    const s1 = createMockStream();
    await handleContextCommand(createMockRequest('add src/a.ts'), s1, token, fs, ws);

    const stream = createMockStream();
    await handleContextCommand(createMockRequest('remove src/a.ts'), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Removido');
  });

  it('reports remove of non-context file', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    const stream = createMockStream();
    await handleContextCommand(createMockRequest('remove src/nope.ts'), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Não encontrado no contexto');
  });

  it('clears all context files', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('C:/workspace/src/a.ts', 'code');
    const ws = new WorkspaceStub();

    const s1 = createMockStream();
    await handleContextCommand(createMockRequest('add src/a.ts'), s1, token, fs, ws);

    const stream = createMockStream();
    await handleContextCommand(createMockRequest('clear'), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Contexto limpo');

    // Verify empty after clear
    const listStream = createMockStream();
    await handleContextCommand(createMockRequest(''), listStream, token, fs, ws);
    expect(listStream.getAllMarkdown()).toContain('Nenhum arquivo de contexto');
  });

  it('shows usage for invalid action', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    await handleContextCommand(createMockRequest('unknown'), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Ação inválida');
  });

  it('shows error when add without path', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    await handleContextCommand(createMockRequest('add'), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Forneça o caminho');
  });
});
