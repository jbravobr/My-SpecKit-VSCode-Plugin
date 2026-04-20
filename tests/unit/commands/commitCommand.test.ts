import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCommitCommand } from '../../../src/participant/commands/commitCommand';
import { IGitOps } from '../../../src/workflow/GitOperations';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

const token = createMockToken();

function fakeGit(overrides: Partial<IGitOps> = {}): IGitOps {
  return {
    diff: async () => '',
    commit: async () => '[main abc1234] speckit: test\n 1 file changed, 2 insertions',
    hasChanges: async () => true,
    ...overrides,
  };
}

describe('handleCommitCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    ws.getWorkspaceRoot = () => undefined;

    await handleCommitCommand(
      createMockRequest('fix: algo'),
      stream,
      token,
      ws,
      new InMemoryFileSystem(),
      fakeGit(),
    );

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
  });

  it('shows error when no message provided', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();

    await handleCommitCommand(
      createMockRequest(''),
      stream,
      token,
      ws,
      new InMemoryFileSystem(),
      fakeGit(),
    );

    expect(stream.getAllMarkdown()).toContain('Forneça uma mensagem');
    expect(stream.getAllMarkdown()).toContain('Exemplo');
  });

  it('shows "nothing to commit" when no changes', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const git = fakeGit({ hasChanges: async () => false });

    await handleCommitCommand(
      createMockRequest('test commit'),
      stream,
      token,
      ws,
      new InMemoryFileSystem(),
      git,
    );

    expect(stream.getAllMarkdown()).toContain('Nada para commitar');
  });

  it('commits with speckit: prefix and shows output', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const fs = new InMemoryFileSystem();
    let capturedMessage = '';
    const git = fakeGit({
      commit: async (_cwd, msg) => {
        capturedMessage = msg;
        return `[main abc] ${msg}`;
      },
    });

    await handleCommitCommand(
      createMockRequest('refactor: extrair validação'),
      stream,
      token,
      ws,
      fs,
      git,
    );

    expect(capturedMessage).toBe('speckit: refactor: extrair validação');
    expect(stream.getAllMarkdown()).toContain('Commit realizado');
    expect(stream.getAllMarkdown()).toContain('speckit: refactor');
  });

  it('writes session log after successful commit', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const fs = new InMemoryFileSystem();
    const git = fakeGit();

    await handleCommitCommand(createMockRequest('feat: nova feature'), stream, token, ws, fs, git);

    const sessionContent = fs.contentFor('session-');
    expect(sessionContent).toBeDefined();
    expect(sessionContent).toContain('/commit');
    expect(sessionContent).toContain('Commit realizado');
  });

  it('shows error message when git fails', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const git = fakeGit({
      commit: async () => {
        throw new Error('pre-commit hook failed');
      },
    });

    await handleCommitCommand(
      createMockRequest('test'),
      stream,
      token,
      ws,
      new InMemoryFileSystem(),
      git,
    );

    expect(stream.getAllMarkdown()).toContain('Erro ao executar git commit');
    expect(stream.getAllMarkdown()).toContain('pre-commit hook failed');
  });
});
