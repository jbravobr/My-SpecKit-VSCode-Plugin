// AuditLogger — Append-only file-based audit log for spec operations
//
// Logs are written to .speckit/audit.log in the workspace root.

import * as path from 'path';

import type { IFileSystem } from '../generator/utils/IFileSystem';
import { redactSensitiveText } from '../security/Redaction';

export interface GraphAuditPayloadByEvent {
  'graph.build': {
    workspaceFolder: string;
    nodesCount: number;
    edgesCount: number;
    durationMs: number;
    partialLanguages: string[];
  };
  'graph.refresh.incremental': { touchedFiles: number; durationMs: number };
  'graph.stale.detected': {
    reason: 'headDrift' | 'perFileHash' | 'perFileMtime' | 'missing';
    commandName?: string;
  };
  'graph.gate.injected': { commandName: string; mode: 'sync' | 'stale-async' | 'no-op' };
  'graph.veto.triggered': { commandName: string; semanticHits: number; graphHits: number };
  'graph.batch.refresh': { batchSize: number; coalesced: number; durationMs: number };
  'graph.perf.violation': {
    component: 'gate' | 'ensureFresh' | 'build';
    budgetMs: number;
    actualMs: number;
  };
}

export type GraphAuditEvent = keyof GraphAuditPayloadByEvent;
export type GraphAuditPayload = GraphAuditPayloadByEvent[GraphAuditEvent];

export type AuditEvent =
  | 'file_edit'
  | 'file_write'
  | 'command'
  | 'tool_call'
  | 'permission'
  | 'gate_transition'
  | GraphAuditEvent;

export interface AuditEntry {
  timestamp: string;
  event: AuditEvent;
  detail: string;
}

type AuditContextValue = string | number | boolean | readonly string[] | undefined;
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

  async logGraphEvent<T extends GraphAuditEvent>(
    event: T,
    payload: GraphAuditPayloadByEvent[T],
  ): Promise<void> {
    await this.log(event, event, payloadToAuditContext(payload));
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
    .map(
      ([key, value]) =>
        `${key}="${normalizeSingleLine(redactSensitiveText(formatContextValue(value))).replace(/"/g, '\\"')}"`,
    );

  if (parts.length === 0) return normalizedDetail;
  return `${normalizedDetail} | ${parts.join(' ')}`;
}

function payloadToAuditContext(payload: GraphAuditPayload): AuditContext {
  const context: AuditContext = {};
  for (const [key, value] of Object.entries(payload)) {
    if (isAuditContextValue(value)) {
      context[key] = value;
    }
  }
  return context;
}

function isAuditContextValue(value: unknown): value is AuditContextValue {
  return (
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

function formatContextValue(value: AuditContextValue): string {
  return Array.isArray(value) ? value.join(',') : String(value);
}

function normalizeSingleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}
