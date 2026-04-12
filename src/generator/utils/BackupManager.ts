import * as path from 'path';
import { IFileSystem } from './IFileSystem';

const MAX_BACKUPS = 5;

/**
 * Backs up `.github/copilot-instructions.md` before regeneration.
 * Stores in `.speckit/backups/<ISO-timestamp>/copilot-instructions.md`.
 * Keeps only the last MAX_BACKUPS entries, pruning oldest.
 * Returns the backup path if created, or undefined if nothing to backup.
 */
export async function backupCopilotInstructions(
  workspaceRoot: string,
  fs: IFileSystem,
): Promise<string | undefined> {
  const sourcePath = path.join(workspaceRoot, '.github', 'copilot-instructions.md');
  const exists = await fs.fileExists(sourcePath);
  if (!exists) {
    return undefined;
  }

  const content = await fs.readFile(sourcePath);
  if (!content.trim()) {
    return undefined;
  }

  const backupsDir = path.join(workspaceRoot, '.speckit', 'backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(backupsDir, timestamp);

  await fs.ensureDir(backupDir);
  const backupPath = path.join(backupDir, 'copilot-instructions.md');
  await fs.writeFile(backupPath, content);

  await pruneBackups(backupsDir, fs);

  return backupPath;
}

async function pruneBackups(backupsDir: string, fs: IFileSystem): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.listDir(backupsDir);
  } catch {
    return;
  }

  if (entries.length <= MAX_BACKUPS) {
    return;
  }

  // ISO timestamps sort lexicographically — oldest first
  const sorted = entries.slice().sort();
  const toRemove = sorted.slice(0, sorted.length - MAX_BACKUPS);

  await Promise.all(toRemove.map((entry) => fs.deleteDir(path.join(backupsDir, entry))));
}
