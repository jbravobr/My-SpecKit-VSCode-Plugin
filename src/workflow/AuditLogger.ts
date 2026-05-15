// AuditLogger — Append-only file-based audit log for spec operations
//
// Logs are written to .speckit/audit.log in the workspace root.

import * as path from 'path';

import type { IFileSystem } from '../generator/utils/IFileSystem';
import { redactSensitiveText } from '../security/Redaction';

export type AuditEvent =
  | 'file_edit'
  | 'file_write'
  | 'command'
  | 'tool_call'
  | 'permission'
  | 'gate_transition';

export interface AuditEntry {
  timestamp: string;
  event: AuditEvent;
  detail: string;
}

type AuditContextValue = string | number | boolean | undefined;
type AuditContext = Record<string, AuditContextValue>;

export class AuditLogger {
  private readonly logPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    workspaceRoot: string,
    private readonly fs: IFileSystem,
  ) {
    this.logPath = path.join(workspaceRoot, '.speckit', 'audit.log');
  }

  async log(event: AuditEvent, detail: string, context?: AuditContext): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => this.doLog(event, detail, context));
    return this.writeQueue;
  }

  private async doLog(event: AuditEvent, detail: string, context?: AuditContext): Promise<void> {
    const withContext = serializeContext(redactSensitiveText(detail), context);
    const entry: AuditEntry = { timestamp: new Date().toISOString(), event, detail: withContext };
    const line = `[${entry.timestamp}] ${entry.event}: ${entry.detail}\n`;
    try {
      await this.fs.ensureDir(path.dirname(this.logPath));
      let existing = '';
      try {
        existing = await this.fs.readFile(this.logPath);
      } catch {
        // File doesn't exist yet — start fresh
      }
      await this.fs.writeFile(this.logPath, existing + line);
    } catch {
      // Audit should never break the main flow
    }
  }

  async readLog(): Promise<string[]> {
    try {
      const exists = await this.fs.fileExists(this.logPath);
      if (!exists) return [];
      const content = await this.fs.readFile(this.logPath);
      return content.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  getLogPath(): string {
    return this.logPath;
  }
}

function serializeContext(detail: string, context?: AuditContext): string {
  const normalizedDetail = normalizeSingleLine(detail);
  if (!context) return normalizedDetail;

  const parts = Object.entries(context)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) =>
      `${key}="${normalizeSingleLine(redactSensitiveText(String(value))).replace(/"/g, '\\"')}"`,
    );

  if (parts.length === 0) return normalizedDetail;
  return `${normalizedDetail} | ${parts.join(' ')}`;
}

function normalizeSingleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}
