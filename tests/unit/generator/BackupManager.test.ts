import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backupCopilotInstructions } from '../../../src/generator/utils/BackupManager';
import { InMemoryFileSystem } from '../../support/fakes';

const root = '/workspace';

describe('backupCopilotInstructions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T14:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined when no copilot-instructions.md exists', async () => {
    const fs = new InMemoryFileSystem();
    const result = await backupCopilotInstructions(root, fs);
    expect(result).toBeUndefined();
  });

  it('returns undefined when copilot-instructions.md is empty', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('/workspace/.github/copilot-instructions.md', '  ');
    const result = await backupCopilotInstructions(root, fs);
    expect(result).toBeUndefined();
  });

  it('backs up existing copilot-instructions.md to timestamped dir', async () => {
    const fs = new InMemoryFileSystem();
    const original = '# Old Instructions\nSome content here.';
    await fs.writeFile('/workspace/.github/copilot-instructions.md', original);

    const result = await backupCopilotInstructions(root, fs);

    expect(result).toBeDefined();
    expect(result).toContain('backups');
    expect(result).toContain('copilot-instructions.md');

    const backedUp = await fs.readFile(result!);
    expect(backedUp).toBe(original);
  });

  it('uses ISO timestamp in backup directory name', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('/workspace/.github/copilot-instructions.md', '# Content');

    const result = await backupCopilotInstructions(root, fs);

    // ISO: 2026-03-20T14:30:00.000Z → 2026-03-20T14-30-00-000Z
    expect(result).toContain('2026-03-20T14-30-00-000Z');
  });

  it('preserves existing backups when under the limit', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('/workspace/.github/copilot-instructions.md', '# Current');

    // Create 3 existing backups
    for (let i = 1; i <= 3; i++) {
      await fs.writeFile(
        `/workspace/.speckit/backups/2026-03-20T10-0${i}-00-000Z/copilot-instructions.md`,
        `# Backup ${i}`,
      );
    }

    await backupCopilotInstructions(root, fs);

    // All 3 old + 1 new = 4, under limit of 5
    const dirs = await fs.listDir('/workspace/.speckit/backups');
    expect(dirs.length).toBe(4);
  });

  it('prunes oldest backups when exceeding limit of 5', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('/workspace/.github/copilot-instructions.md', '# Current');

    // Create 5 existing backups (at the limit)
    for (let i = 1; i <= 5; i++) {
      await fs.writeFile(
        `/workspace/.speckit/backups/2026-03-20T10-0${i}-00-000Z/copilot-instructions.md`,
        `# Backup ${i}`,
      );
    }

    await backupCopilotInstructions(root, fs);

    // 5 old + 1 new = 6 → prune oldest 1 → 5 remain
    const dirs = await fs.listDir('/workspace/.speckit/backups');
    expect(dirs.length).toBe(5);

    // Oldest (10-01) should be pruned
    expect(dirs).not.toContain('2026-03-20T10-01-00-000Z');
    // Newest should exist
    expect(dirs).toContain('2026-03-20T14-30-00-000Z');
  });

  it('multiple sequential backups with different timestamps work', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('/workspace/.github/copilot-instructions.md', '# V1');

    vi.setSystemTime(new Date('2026-03-20T14:30:00.000Z'));
    await backupCopilotInstructions(root, fs);

    await fs.writeFile('/workspace/.github/copilot-instructions.md', '# V2');
    vi.setSystemTime(new Date('2026-03-20T14:31:00.000Z'));
    await backupCopilotInstructions(root, fs);

    const dirs = await fs.listDir('/workspace/.speckit/backups');
    expect(dirs.length).toBe(2);
  });
});
