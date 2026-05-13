import * as path from 'path';
import type { IFileSystem } from '../generator/utils/IFileSystem';
import type { Gate, Story } from '../story/Story';
import {
  AcceptanceCriteriaTestPresenceValidator,
  CoverageThresholdValidator,
  CrapValidator,
  SecretLeakValidator,
  StoryHeuristicValidator,
  TestExecutionValidator,
  TypecheckValidator,
} from '../validator/auto';
import { EvidenceReportWriter } from './EvidenceReportWriter';
import { GateEvidenceCollector, type EvidenceReport } from './GateEvidenceCollector';
import type { IGitOps } from './GitOperations';
import { IterationCounter } from './IterationCounter';
import { MetricsRecorder } from './MetricsRecorder';
import {
  buildRevisorPrompt,
  type IterationContext,
  type RevisorPrompt,
} from './RevisorFeedbackBridge';

export interface GateVerificationHookInput {
  workspaceRoot: string;
  fs: IFileSystem;
  git?: IGitOps;
  story: Story;
  toGate: Gate;
  signal?: AbortSignal;
  collector?: GateEvidenceCollector;
}

export interface GateVerificationHookOutput {
  report: EvidenceReport;
  prompt: RevisorPrompt;
  evidencePath: string;
  latestPath: string;
  jsonPath: string;
  iteration?: IterationContext;
}

interface PreviousEvidenceSnapshot {
  blockingCount: number;
  validatorsBlocking: Set<string>;
}

async function readPreviousEvidence(
  fs: IFileSystem,
  workspaceRoot: string,
  specId: string,
  gate: Gate,
): Promise<PreviousEvidenceSnapshot | undefined> {
  try {
    const dir = path.posix.join(workspaceRoot.replace(/\\/g, '/'), '.speckit/evidence');
    const list = await fs.listDir(dir);
    const prefix = `${specId}-`;
    const candidates = list.filter((n) => n.startsWith(prefix) && n.endsWith('.json')).sort();
    for (let i = candidates.length - 1; i >= 0; i--) {
      const full = path.posix.join(dir, candidates[i]);
      try {
        const raw = await fs.readFile(full);
        const data = JSON.parse(raw) as {
          gate?: number;
          findings?: Array<{ severity?: string; validator?: string }>;
        };
        if (data.gate !== gate) continue;
        const blocking = (data.findings ?? []).filter(
          (f) => f.severity === 'blocker' || f.severity === 'error',
        );
        return {
          blockingCount: blocking.length,
          validatorsBlocking: new Set(blocking.map((b) => b.validator ?? '').filter(Boolean)),
        };
      } catch {
        continue;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function buildDefaultGateCollector(): GateEvidenceCollector {
  const c = new GateEvidenceCollector();
  c.registerValidator(new StoryHeuristicValidator());
  c.registerValidator(new TypecheckValidator());
  c.registerValidator(new AcceptanceCriteriaTestPresenceValidator());
  c.registerValidator(new TestExecutionValidator());
  c.registerValidator(new CoverageThresholdValidator());
  c.registerValidator(new CrapValidator());
  c.registerValidator(new SecretLeakValidator());
  return c;
}

/**
 * Runs the deterministic gate validators for the target gate and persists evidence to
 * `.speckit/evidence/`. Always returns a result (never throws); callers may use the
 * `report.passed` flag to decide whether to alert the Revisor agent.
 *
 * This hook is informational by default — it does NOT abort transitions; instead it
 * leaves a deterministic evidence artifact for the Revisor agent to consume.
 */
export async function runGateVerificationHook(
  input: GateVerificationHookInput,
): Promise<GateVerificationHookOutput> {
  const collector = input.collector ?? buildDefaultGateCollector();
  let storyFiles: string[] = [];
  if (input.git?.changedFiles) {
    try {
      storyFiles = await input.git.changedFiles(input.workspaceRoot);
    } catch {
      storyFiles = [];
    }
  }

  // Read previous evidence BEFORE writing the new report (so we don't read our own output).
  const previous = await readPreviousEvidence(
    input.fs,
    input.workspaceRoot,
    input.story.metadata.id,
    input.toGate,
  );

  const report = await collector.collect({
    workspaceRoot: input.workspaceRoot,
    fs: input.fs,
    story: input.story,
    storyFiles,
    gateTarget: input.toGate,
    signal: input.signal,
  });

  // Iteration tracking: increment counter only when the gate is BLOCKED.
  let iteration: IterationContext | undefined;
  try {
    const counter = new IterationCounter(input.fs, input.workspaceRoot);
    if (!report.passed) {
      const r = await counter.increment(input.story.metadata.id, input.toGate);
      iteration = { attempt: r.count, limit: r.limit };
    } else {
      const r = await counter.get(input.story.metadata.id, input.toGate);
      iteration = { attempt: r.count, limit: r.limit };
      // Reset counter on success so next blocking iteration starts fresh
      await counter.reset(input.story.metadata.id, input.toGate);
    }
    if (previous) {
      iteration.previousBlockingCount = previous.blockingCount;
      const currentBlockingValidators = new Set(
        report.findings
          .filter((f) => f.severity === 'blocker' || f.severity === 'error')
          .map((f) => f.validator),
      );
      const regressed = [...currentBlockingValidators].filter(
        (v) => !previous.validatorsBlocking.has(v),
      );
      if (regressed.length > 0) iteration.regressedValidators = regressed;
    }
  } catch {
    iteration = undefined;
  }

  const writer = new EvidenceReportWriter(input.fs, input.workspaceRoot);
  const written = await writer.write(report, input.story.metadata.id);
  const prompt = buildRevisorPrompt(report, iteration);

  try {
    const recorder = new MetricsRecorder(input.fs, input.workspaceRoot);
    await recorder.recordEvidence(input.story.metadata.id, report);
  } catch {
    // swallow — telemetria nunca bloqueia
  }

  return {
    report,
    prompt,
    evidencePath: written.reportPath,
    latestPath: written.latestPath,
    jsonPath: written.jsonPath,
    iteration,
  };
}
