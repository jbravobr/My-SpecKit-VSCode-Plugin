import { describe, expect, it } from 'vitest';
import { handleDiffCommand } from '../../../src/participant/commands/diffCommand';
import { IGitOps } from '../../../src/workflow/GitOperations';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  WorkspaceStub,
} from '../../support/fakes';

const token = createMockToken();

function fakeGit(overrides: Partial<IGitOps> = {}): IGitOps {
  return {
    diff: async () => '',
    commit: async () => '',
    hasChanges: async () => false,
    ...overrides,
  };
}

describe('handleDiffCommand', () => {
  it('shows error when no workspace', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    ws.getWorkspaceRoot = () => undefined;

    await handleDiffCommand(createMockRequest(''), stream, token, ws, fakeGit());

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
  });

  it('shows "no changes" when diff is empty', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const git = fakeGit({ diff: async () => '' });

    await handleDiffCommand(createMockRequest(''), stream, token, ws, git);

    expect(stream.getAllMarkdown()).toContain('Nenhuma alteração pendente');
  });

  it('shows stat output in code block by default', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const git = fakeGit({
      diff: async (_cwd, full) => (full ? 'full diff' : ' src/file.ts | 3 +++\n 1 file changed'),
    });

    await handleDiffCommand(createMockRequest(''), stream, token, ws, git);

    const output = stream.getAllMarkdown();
    expect(output).toContain('resumo');
    expect(output).toContain('```diff');
    expect(output).toContain('src/file.ts');
  });

  it('shows full diff when --full flag', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const git = fakeGit({
      diff: async (_cwd, full) => (full ? '+added line\n-removed line' : 'stat'),
    });

    await handleDiffCommand(createMockRequest('--full'), stream, token, ws, git);

    const output = stream.getAllMarkdown();
    expect(output).toContain('completo');
    expect(output).toContain('+added line');
  });

  it('shows full diff when -f flag', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const git = fakeGit({ diff: async (_cwd, full) => (full ? 'full content' : 'stat') });

    await handleDiffCommand(createMockRequest('-f'), stream, token, ws, git);

    expect(stream.getAllMarkdown()).toContain('completo');
  });

  it('shows error message when git fails', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const git = fakeGit({
      diff: async () => {
        throw new Error('not a git repository');
      },
    });

    await handleDiffCommand(createMockRequest(''), stream, token, ws, git);

    expect(stream.getAllMarkdown()).toContain('Erro ao executar git diff');
    expect(stream.getAllMarkdown()).toContain('not a git repository');
  });
});
