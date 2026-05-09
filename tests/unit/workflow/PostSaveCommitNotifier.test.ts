import { describe, expect, it, vi } from 'vitest';
import { checkPostSavePendingCommit } from '../../../src/workflow/PostSaveCommitNotifier';
import { IGitOps } from '../../../src/workflow/GitOperations';
import { InMemoryFileSystem, WorkspaceStub } from '../../support/fakes';

function fakeGit(overrides: Partial<IGitOps> = {}): IGitOps {
  return {
    diff: async () => '',
    commit: async () => '',
    commitFile: async () => '',
    hasChanges: async () => false,
    isRepository: async () => true,
    init: async () => '',
    changedFiles: async () => [],
    ...overrides,
  };
}

function storyAt(gate: number, status: string): string {
  return `# Story 001\n\n<!-- metadata\nid: 001\ntitle: Test Story\ngate: ${gate}\nstatus: ${status}\n-->`;
}

describe('checkPostSavePendingCommit', () => {
  it('calls notify when active spec is gate 4/done and git is dirty', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/STORY-001.md' });
    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyAt(4, 'done'));

    const notify = vi.fn().mockResolvedValue(true);

    await checkPostSavePendingCommit({
      workspace: ws,
      fs,
      git: fakeGit({ hasChanges: async () => true }),
      notify,
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith('001');
  });

  it('does NOT call notify when git is clean', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/STORY-001.md' });
    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyAt(4, 'done'));

    const notify = vi.fn();

    await checkPostSavePendingCommit({
      workspace: ws,
      fs,
      git: fakeGit({ hasChanges: async () => false }),
      notify,
    });

    expect(notify).not.toHaveBeenCalled();
  });

  it('does NOT call notify when spec is gate 4 but not status done', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/STORY-001.md' });
    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyAt(4, 'review'));

    const notify = vi.fn();

    await checkPostSavePendingCommit({
      workspace: ws,
      fs,
      git: fakeGit({ hasChanges: async () => true }),
      notify,
    });

    expect(notify).not.toHaveBeenCalled();
  });

  it('does NOT call notify when spec is status done but gate < 4', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/STORY-001.md' });
    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyAt(3, 'done'));

    const notify = vi.fn();

    await checkPostSavePendingCommit({
      workspace: ws,
      fs,
      git: fakeGit({ hasChanges: async () => true }),
      notify,
    });

    expect(notify).not.toHaveBeenCalled();
  });

  it('does NOT call notify when there is no active spec path', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ activeSpecPath: undefined as unknown as string });
    ws.getActiveSpecPath = async () => undefined;

    const notify = vi.fn();

    await checkPostSavePendingCommit({
      workspace: ws,
      fs,
      git: fakeGit({ hasChanges: async () => true }),
      notify,
    });

    expect(notify).not.toHaveBeenCalled();
  });

  it('does NOT call notify when there is no workspace root', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    ws.getWorkspaceRoot = () => undefined;

    const notify = vi.fn();

    await checkPostSavePendingCommit({
      workspace: ws,
      fs,
      git: fakeGit({ hasChanges: async () => true }),
      notify,
    });

    expect(notify).not.toHaveBeenCalled();
  });

  it('is silent when git.hasChanges throws', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/STORY-001.md' });
    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyAt(4, 'done'));

    const notify = vi.fn();

    await expect(
      checkPostSavePendingCommit({
        workspace: ws,
        fs,
        git: fakeGit({
          hasChanges: async () => {
            throw new Error('git not found');
          },
        }),
        notify,
      }),
    ).resolves.not.toThrow();

    expect(notify).not.toHaveBeenCalled();
  });
});
