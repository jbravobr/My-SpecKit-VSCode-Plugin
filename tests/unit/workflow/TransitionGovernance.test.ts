import { describe, expect, it } from 'vitest';
import { InMemoryFileSystem } from '../../support/fakes';
import {
  clearBranchSessionGovernance,
  getBranchSessionGovernance,
  setBranchSessionGovernance,
} from '../../../src/workflow/TransitionGovernance';

describe('TransitionGovernance branch session governance', () => {
  it('persists and returns the session branch strategy for the current VS Code session', async () => {
    const fs = new InMemoryFileSystem();
    const workspaceRoot = 'C:/workspace';

    await setBranchSessionGovernance(workspaceRoot, fs, {
      strategy: 'session',
      command: '/batch --generate --unified',
      citedMentions: ['develop'],
      sessionBranch: 'feature/runtime-session',
      sessionBranchSource: 'current',
    });

    const governance = await getBranchSessionGovernance(workspaceRoot, fs);
    expect(governance).toBeDefined();
    expect(governance?.strategy).toBe('session');
    expect(governance?.sessionBranch).toBe('feature/runtime-session');
    expect(governance?.citedMentions).toEqual(['develop']);
  });

  it('clears the persisted branch governance state', async () => {
    const fs = new InMemoryFileSystem();
    const workspaceRoot = 'C:/workspace';

    await setBranchSessionGovernance(workspaceRoot, fs, {
      strategy: 'cited',
      command: '/batch --generate --unified',
      citedMentions: ['develop'],
    });
    await clearBranchSessionGovernance(workspaceRoot, fs);

    await expect(getBranchSessionGovernance(workspaceRoot, fs)).resolves.toBeUndefined();
  });

  it('rejects session strategy persistence when the canonical session branch is missing', async () => {
    const fs = new InMemoryFileSystem();
    const workspaceRoot = 'C:/workspace';

    await expect(
      setBranchSessionGovernance(workspaceRoot, fs, {
        strategy: 'session',
        command: '/batch --generate --unified',
        citedMentions: ['develop'],
      }),
    ).rejects.toThrow('exige uma branch canônica resolvida');
  });
});
