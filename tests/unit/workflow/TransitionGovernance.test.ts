import { describe, expect, it } from 'vitest';
import { InMemoryFileSystem } from '../../support/fakes';
import {
  createTransitionIntent,
  clearBranchSessionGovernance,
  getBatchSessionConsent,
  getBranchSessionGovernance,
  getTransitionIntent,
  setBatchSessionConsent,
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

  it('redacts sensitive values persisted in transition intent and consent', async () => {
    const fs = new InMemoryFileSystem();
    const workspaceRoot = 'C:/workspace';

    const intent = await createTransitionIntent(workspaceRoot, fs, {
      kind: 'mode-switch',
      command: '/agent --token ghp_abcdefghijklmnopqrstuvwxyz123456789012',
      payload: { authorization: 'Bearer top-secret-token' },
    });
    await setBatchSessionConsent(workspaceRoot, fs, {
      note: 'authorization=Bearer top-secret-token',
    });

    const loadedIntent = await getTransitionIntent(workspaceRoot, fs, intent.id);
    const consent = await getBatchSessionConsent(workspaceRoot, fs);

    expect(loadedIntent?.command).toContain('[REDACTED]');
    expect(loadedIntent?.payload.authorization).toContain('Bearer [REDACTED]');
    expect(consent?.note).toContain('Bearer [REDACTED]');
  });

  it('redacts sensitive values persisted in branch session governance', async () => {
    const fs = new InMemoryFileSystem();
    const workspaceRoot = 'C:/workspace';

    await setBranchSessionGovernance(workspaceRoot, fs, {
      strategy: 'session',
      command: '/batch --generate --unified --token ghp_abcdefghijklmnopqrstuvwxyz123456789012',
      citedMentions: ['Bearer top-secret-token'],
      sessionBranch: 'feature/token-ghp_abcdefghijklmnopqrstuvwxyz123456789012',
      sessionBranchSource: 'current',
    });

    const governance = await getBranchSessionGovernance(workspaceRoot, fs);
    expect(governance?.command).toContain('[REDACTED]');
    expect(governance?.citedMentions[0]).toContain('Bearer [REDACTED]');
    expect(governance?.sessionBranch).toContain('[REDACTED]');
  });
});
