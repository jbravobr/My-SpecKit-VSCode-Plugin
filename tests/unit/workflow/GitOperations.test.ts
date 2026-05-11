import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

describe('gitOps branch helpers', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    vi.resetModules();
  });

  it('returns the trimmed current branch name', async () => {
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: object,
        callback: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, 'feature/runtime-session\n', '');
      },
    );

    const { gitOps } = await import('../../../src/workflow/GitOperations.js');
    await expect(gitOps.currentBranch?.('C:/workspace')).resolves.toBe('feature/runtime-session');
  });

  it('throws an explicit error when Git has no active branch', async () => {
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: object,
        callback: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, '\n', '');
      },
    );

    const { gitOps } = await import('../../../src/workflow/GitOperations.js');
    await expect(gitOps.currentBranch?.('C:/workspace')).rejects.toThrow('HEAD indefinido');
  });

  it('rejects attempts to create a branch with an empty name', async () => {
    const { gitOps } = await import('../../../src/workflow/GitOperations.js');
    await expect(gitOps.createBranch?.('C:/workspace', '   ')).rejects.toThrow(
      'não pode ser vazio',
    );
  });
});
