import type { Gate, Story } from '../../story/Story';
import type { IFileSystem } from '../../generator/utils/IFileSystem';

export type Severity = 'info' | 'warn' | 'error' | 'blocker';

export interface DelegatedExecution {
  reason: string;
  command: string;
  stack?: string;
}

export interface Finding {
  validator: string;
  severity: Severity;
  message: string;
  gateTarget?: Gate;
  path?: string;
  line?: number;
  suggestedFix?: string;
  delegatedToRevisor?: DelegatedExecution;
  metadata?: Record<string, unknown>;
}

export interface ValidatorContext {
  workspaceRoot: string;
  fs: IFileSystem;
  story?: Story;
  storyFiles?: string[];
  gateTarget?: Gate;
  signal?: AbortSignal;
}

export interface Validator {
  readonly id: string;
  readonly description: string;
  run(ctx: ValidatorContext): Promise<Finding[]>;
}

export interface ValidatorExecutionStat {
  id: string;
  durationMs: number;
  findingCount: number;
  error?: string;
}

export interface ValidationReport {
  runId: string;
  gateTarget?: Gate;
  findings: Finding[];
  passed: boolean;
  durationMs: number;
  perValidator: ValidatorExecutionStat[];
}

export interface RunOptions {
  only?: string[];
  concurrency?: number;
  /** Optional per-validator timeout in milliseconds. Defaults to no timeout. */
  timeoutMs?: number;
}

export const BLOCKING_SEVERITIES: ReadonlySet<Severity> = new Set<Severity>(['error', 'blocker']);

export function isBlocking(finding: Finding): boolean {
  return BLOCKING_SEVERITIES.has(finding.severity);
}
