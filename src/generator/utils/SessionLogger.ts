import * as path from 'path';
import { IFileSystem } from './IFileSystem';

export interface LogEntry {
  command: string;
  specId?: string;
  specTitle?: string;
  outcome: string;
  detail?: string;
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function dateStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function formatEntry(entry: LogEntry): string {
  const lines: string[] = [
    `## ${timestamp()} — @speckit ${entry.command}`,
  ];
  if (entry.specId || entry.specTitle) {
    const parts = [entry.specId, entry.specTitle].filter(Boolean);
    lines.push(`**Spec:** ${parts.join(' — ')}`);
  }
  lines.push(`**Resultado:** ${entry.outcome}`);
  if (entry.detail) {
    lines.push(entry.detail);
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

export async function appendLog(
  workspaceRoot: string,
  entry: LogEntry,
  fs: IFileSystem,
): Promise<void> {
  try {
    const logsDir = path.join(workspaceRoot, '.speckit', 'logs');
    await fs.ensureDir(logsDir);

    const logPath = path.join(logsDir, `session-${dateStamp()}.md`);

    let existing = '';
    try {
      existing = await fs.readFile(logPath);
    } catch {
      existing = `# SpecKit Session Log — ${dateStamp()}\n\n`;
    }

    await fs.writeFile(logPath, existing + formatEntry(entry));
  } catch {
    // Log failure must never break the command
  }
}
