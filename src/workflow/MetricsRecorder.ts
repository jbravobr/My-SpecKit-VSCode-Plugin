import * as path from 'path';
import type { IFileSystem } from '../generator/utils/IFileSystem';
import type { Gate } from '../story/Story';
import type { EvidenceReport } from './GateEvidenceCollector';

export interface GraphMetricPayloadByType {
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

export type GraphMetricEventType = keyof GraphMetricPayloadByType;
export type GraphMetricPayload = GraphMetricPayloadByType[GraphMetricEventType];

export type MetricEventType =
  | 'gate-verification'
  | 'gate-transition'
  | 'incremental-crap'
  | 'spec-heuristic'
  | 'verify-command'
  | GraphMetricEventType;

export interface MetricEvent {
  type: MetricEventType;
  ts: string;
  specId?: string;
  gate?: Gate;
  durationMs?: number;
  validatorsRun?: string[];
  findingsTotal?: number;
  findingsBlocking?: number;
  passed?: boolean;
  payload?: GraphMetricPayload;
  extra?: Record<string, unknown>;
}

const FILE_REL = '.speckit/metrics/events.jsonl';
const MAX_BYTES = 2 * 1024 * 1024; // 2 MiB rolling cap

function fullPath(workspaceRoot: string): string {
  return path.posix.join(workspaceRoot.replace(/\\/g, '/'), FILE_REL);
}

export class MetricsRecorder {
  constructor(
    private readonly fs: IFileSystem,
    private readonly workspaceRoot: string,
    private readonly maxBytes: number = MAX_BYTES,
  ) {}

  async record(event: MetricEvent): Promise<void> {
    const file = fullPath(this.workspaceRoot);
    await this.fs.ensureDir(path.posix.dirname(file));
    const line = JSON.stringify({ ...event, ts: event.ts ?? new Date().toISOString() }) + '\n';
    let existing = '';
    try {
      if (await this.fs.fileExists(file)) {
        existing = await this.fs.readFile(file);
      }
    } catch {
      existing = '';
    }
    let next = existing + line;
    if (next.length > this.maxBytes) {
      // drop oldest lines until under cap
      const lines = next.split('\n');
      while (lines.join('\n').length > this.maxBytes && lines.length > 1) {
        lines.shift();
      }
      next = lines.join('\n');
    }
    await this.fs.writeFile(file, next);
  }

  async recordEvidence(specId: string | undefined, report: EvidenceReport): Promise<void> {
    const blocking = report.findings.filter(
      (f) => f.severity === 'blocker' || f.severity === 'error',
    ).length;
    await this.record({
      type: 'gate-verification',
      ts: new Date().toISOString(),
      specId,
      gate: report.gate,
      durationMs: report.durationMs,
      validatorsRun: report.validatorsRun,
      findingsTotal: report.findings.length,
      findingsBlocking: blocking,
      passed: report.passed,
    });
  }

  async recordGraphEvent<T extends GraphMetricEventType>(
    type: T,
    payload: GraphMetricPayloadByType[T],
  ): Promise<void> {
    await this.record({
      type,
      ts: new Date().toISOString(),
      durationMs: 'durationMs' in payload ? payload.durationMs : undefined,
      payload,
    });
  }

  async readAll(): Promise<MetricEvent[]> {
    const file = fullPath(this.workspaceRoot);
    try {
      if (!(await this.fs.fileExists(file))) return [];
      const raw = await this.fs.readFile(file);
      return raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l): MetricEvent | null => {
          try {
            return JSON.parse(l) as MetricEvent;
          } catch {
            return null;
          }
        })
        .filter((x): x is MetricEvent => x !== null);
    } catch {
      return [];
    }
  }
}

export interface MetricsSummary {
  total: number;
  byType: Record<string, number>;
  byGate: Record<string, number>;
  bySpec: Record<string, number>;
  avgDurationMs: number;
  medianDurationMs: number;
  p95DurationMs: number;
  passRate: number; // 0..1
  blockingFindings: number;
  topValidators: { id: string; runs: number }[];
  rangeFrom?: string;
  rangeTo?: string;
}

export function summarize(events: MetricEvent[]): MetricsSummary {
  const total = events.length;
  const byType: Record<string, number> = {};
  const byGate: Record<string, number> = {};
  const bySpec: Record<string, number> = {};
  const validatorCounts = new Map<string, number>();
  const durations: number[] = [];
  let passed = 0;
  let passable = 0;
  let blockingFindings = 0;
  let rangeFrom: string | undefined;
  let rangeTo: string | undefined;

  for (const e of events) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    if (e.gate !== undefined) byGate[String(e.gate)] = (byGate[String(e.gate)] ?? 0) + 1;
    if (e.specId) bySpec[e.specId] = (bySpec[e.specId] ?? 0) + 1;
    if (typeof e.durationMs === 'number') durations.push(e.durationMs);
    if (typeof e.passed === 'boolean') {
      passable++;
      if (e.passed) passed++;
    }
    if (typeof e.findingsBlocking === 'number') blockingFindings += e.findingsBlocking;
    for (const v of e.validatorsRun ?? []) {
      validatorCounts.set(v, (validatorCounts.get(v) ?? 0) + 1);
    }
    if (e.ts) {
      if (!rangeFrom || e.ts < rangeFrom) rangeFrom = e.ts;
      if (!rangeTo || e.ts > rangeTo) rangeTo = e.ts;
    }
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const avgDurationMs =
    sorted.length === 0 ? 0 : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const medianDurationMs = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];
  const p95DurationMs =
    sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const passRate = passable === 0 ? 0 : passed / passable;
  const topValidators = [...validatorCounts.entries()]
    .map(([id, runs]) => ({ id, runs }))
    .sort((a, b) => b.runs - a.runs)
    .slice(0, 10);

  return {
    total,
    byType,
    byGate,
    bySpec,
    avgDurationMs,
    medianDurationMs,
    p95DurationMs,
    passRate,
    blockingFindings,
    topValidators,
    rangeFrom,
    rangeTo,
  };
}
