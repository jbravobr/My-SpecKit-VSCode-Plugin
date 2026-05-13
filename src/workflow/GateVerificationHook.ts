import type { IFileSystem } from '../generator/utils/IFileSystem';
import type { Gate, Story } from '../story/Story';
import {
  AcceptanceCriteriaTestPresenceValidator,
  CoverageThresholdValidator,
  CrapValidator,
  StoryHeuristicValidator,
  TestExecutionValidator,
  TypecheckValidator,
} from '../validator/auto';
import { EvidenceReportWriter } from './EvidenceReportWriter';
import { GateEvidenceCollector, type EvidenceReport } from './GateEvidenceCollector';
import type { IGitOps } from './GitOperations';
import { buildRevisorPrompt, type RevisorPrompt } from './RevisorFeedbackBridge';

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
}

export function buildDefaultGateCollector(): GateEvidenceCollector {
  const c = new GateEvidenceCollector();
  c.registerValidator(new StoryHeuristicValidator());
  c.registerValidator(new TypecheckValidator());
  c.registerValidator(new AcceptanceCriteriaTestPresenceValidator());
  c.registerValidator(new TestExecutionValidator());
  c.registerValidator(new CoverageThresholdValidator());
  c.registerValidator(new CrapValidator());
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

  const report = await collector.collect({
    workspaceRoot: input.workspaceRoot,
    fs: input.fs,
    story: input.story,
    storyFiles,
    gateTarget: input.toGate,
    signal: input.signal,
  });

  const writer = new EvidenceReportWriter(input.fs, input.workspaceRoot);
  const written = await writer.write(report, input.story.metadata.id);
  const prompt = buildRevisorPrompt(report);

  return {
    report,
    prompt,
    evidencePath: written.reportPath,
    latestPath: written.latestPath,
    jsonPath: written.jsonPath,
  };
}
