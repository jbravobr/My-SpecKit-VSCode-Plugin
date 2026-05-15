// TraceabilityManager — Spec-to-commit traceability for SDD workflow
//
// Traces stored as JSON files in .speckit/traceability/<spec-id>.json
// Each trace links a spec to commits, files, and gate transitions.

import * as path from 'path';

import type { IFileSystem } from '../generator/utils/IFileSystem';
import { redactSensitiveText } from '../security/Redaction';

export interface TraceEntry {
  timestamp: string;
  type: 'commit' | 'file' | 'gate' | 'review' | 'custom';
  description: string;
  data: Record<string, string>;
}

export interface SpecTrace {
  specId: string;
  specType: 'story' | 'fix';
  createdAt: string;
  updatedAt: string;
  entries: TraceEntry[];
}

export class TraceabilityManager {
  private readonly traceDir: string;

  constructor(
    workspaceRoot: string,
    private readonly fs: IFileSystem,
  ) {
    this.traceDir = path.join(workspaceRoot, '.speckit', 'traceability');
  }

  private traceFilePath(specId: string): string {
    const safe = specId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.traceDir, `${safe}.json`);
  }

  private sanitizeData(data: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, redactSensitiveText(value)]),
    );
  }

  private sanitizeEntry(entry: TraceEntry): TraceEntry {
    return {
      ...entry,
      description: redactSensitiveText(entry.description),
      data: this.sanitizeData(entry.data),
    };
  }

  private sanitizeTrace(trace: SpecTrace): SpecTrace {
    return {
      ...trace,
      entries: trace.entries.map((entry) => this.sanitizeEntry(entry)),
    };
  }

  async record(
    specId: string,
    specType: 'story' | 'fix',
    entry: Omit<TraceEntry, 'timestamp'>,
  ): Promise<SpecTrace> {
    await this.fs.ensureDir(this.traceDir);
    const existing = await this.load(specId);
    const now = new Date().toISOString();
    const fullEntry: TraceEntry = this.sanitizeEntry({ ...entry, timestamp: now });
    const trace: SpecTrace = existing
      ? { ...existing, updatedAt: now, entries: [...existing.entries, fullEntry] }
      : {
          specId: redactSensitiveText(specId),
          specType,
          createdAt: now,
          updatedAt: now,
          entries: [fullEntry],
        };
    await this.fs.writeFile(this.traceFilePath(specId), JSON.stringify(trace, null, 2));
    return trace;
  }

  async load(specId: string): Promise<SpecTrace | null> {
    const filePath = this.traceFilePath(specId);
    const exists = await this.fs.fileExists(filePath);
    if (!exists) return null;
    try {
      const content = await this.fs.readFile(filePath);
      return this.sanitizeTrace(JSON.parse(content) as SpecTrace);
    } catch {
      return null;
    }
  }

  async list(): Promise<SpecTrace[]> {
    await this.fs.ensureDir(this.traceDir);
    const files = await this.fs.listDir(this.traceDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    const traces: SpecTrace[] = [];
    for (const file of jsonFiles) {
      const specId = file.replace('.json', '');
      const trace = await this.load(specId);
      if (trace) traces.push(trace);
    }
    return traces.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getEntriesByType(specId: string, type: TraceEntry['type']): Promise<TraceEntry[]> {
    const trace = await this.load(specId);
    if (!trace) return [];
    return trace.entries.filter((e) => e.type === type);
  }
}
