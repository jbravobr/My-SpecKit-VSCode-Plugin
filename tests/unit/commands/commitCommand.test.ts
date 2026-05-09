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
    commitFile: async () => '',
    hasChanges: async () => true,
    isRepository: async () => true,
    init: async () => 'Initialized empty Git repository',
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

  it('auto-generates message when none is provided and active story is available', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const fs = new InMemoryFileSystem();
    await fs.writeFile(
      'C:/workspace/.speckit/STORY-001.md',
      '<!-- metadata\nid: 001\nstatus: open\ngate: 2\n-->',
    );
    let capturedMessage = '';
    const git = fakeGit({
      commit: async (_cwd, msg) => {
        capturedMessage = msg;
        return `[main abc] ${msg}`;
      },
    });

    await handleCommitCommand(createMockRequest(''), stream, token, ws, fs, git);

    expect(stream.getAllMarkdown()).toContain('Mensagem não informada');
    expect(capturedMessage).toBe('speckit: test(001): validações do gate 2');
  });

  it('shows error when no message is provided and no active spec can be inferred', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub({ activeSpecPath: undefined as unknown as string });
    ws.getActiveSpecPath = async () => undefined;

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

  it('initializes git repository before committing when workspace is not a repo', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const fs = new InMemoryFileSystem();
    const calls: string[] = [];
    const git = fakeGit({
      isRepository: async () => {
        calls.push('isRepository');
        return false;
      },
      init: async () => {
        calls.push('init');
        return 'Initialized empty Git repository';
      },
      hasChanges: async () => {
        calls.push('hasChanges');
        return true;
      },
      commit: async () => {
        calls.push('commit');
        return '[main abc] speckit: feat: inicial';
      },
    });

    await handleCommitCommand(createMockRequest('feat: inicial'), stream, token, ws, fs, git);

    expect(calls).toEqual(['isRepository', 'init', 'hasChanges', 'commit']);
    expect(stream.getAllMarkdown()).toContain('Repositório Git não encontrado');
    expect(stream.getAllMarkdown()).toContain('git init');
    expect(stream.getAllMarkdown()).toContain('Commit realizado');
  });

  it('does not initialize git repository when workspace is already a repo', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    let initialized = false;
    const git = fakeGit({
      isRepository: async () => true,
      init: async () => {
        initialized = true;
        return 'Initialized empty Git repository';
      },
    });

    await handleCommitCommand(
      createMockRequest('feat: existente'),
      stream,
      token,
      ws,
      new InMemoryFileSystem(),
      git,
    );

    expect(initialized).toBe(false);
    expect(stream.getAllMarkdown()).not.toContain('Repositório Git não encontrado');
    expect(stream.getAllMarkdown()).toContain('Commit realizado');
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
