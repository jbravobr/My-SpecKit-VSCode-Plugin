import type { Gate, Story } from '../story/Story';
import type { IFileSystem } from '../generator/utils/IFileSystem';
import type {
  Finding,
  ValidationReport,
  Validator,
  ValidatorContext,
} from '../validator/auto/types';
import { ValidationRegistry } from '../validator/auto/ValidationRegistry';
import { isBlocking } from '../validator/auto/types';

export interface GateEvidenceCollectorOptions {
  registry?: ValidationRegistry;
  validators?: Validator[];
  gateMap?: Partial<Record<Gate, string[]>>;
}

export interface EvidenceReport {
  gate: Gate;
  passed: boolean;
  findings: Finding[];
  runId: string;
  durationMs: number;
  validatorsRun: string[];
}

export const DEFAULT_GATE_VALIDATORS: Record<Gate, string[]> = {
  0: ['story-heuristic'],
  1: ['story-heuristic', 'typecheck'],
  2: ['typecheck', 'acceptance-test-presence', 'secret-leak'],
  3: ['acceptance-test-presence', 'test-execution', 'coverage-threshold', 'crap', 'secret-leak'],
  4: [],
};

export class GateEvidenceCollector {
  private readonly registry: ValidationRegistry;
  private readonly gateMap: Record<Gate, string[]>;

  constructor(options: GateEvidenceCollectorOptions = {}) {
    this.registry = options.registry ?? new ValidationRegistry();
    if (options.validators) {
      for (const v of options.validators) {
        this.registry.register(v);
      }
    }
    this.gateMap = {
      ...DEFAULT_GATE_VALIDATORS,
      ...(options.gateMap ?? {}),
    } as Record<Gate, string[]>;
  }

  registerValidator(v: Validator): void {
    this.registry.register(v);
  }

  validatorsForGate(gate: Gate): string[] {
    return this.gateMap[gate] ?? [];
  }

  async collect(input: {
    workspaceRoot: string;
    fs: IFileSystem;
    story?: Story;
    storyFiles?: string[];
    gateTarget: Gate;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<EvidenceReport> {
    const ids = this.validatorsForGate(input.gateTarget);
    const ctx: ValidatorContext = {
      workspaceRoot: input.workspaceRoot,
      fs: input.fs,
      story: input.story,
      storyFiles: input.storyFiles,
      gateTarget: input.gateTarget,
      signal: input.signal,
    };
    if (ids.length === 0) {
      return {
        gate: input.gateTarget,
        passed: true,
        findings: [],
        runId: `noop-${Date.now()}`,
        durationMs: 0,
        validatorsRun: [],
      };
    }
    const report: ValidationReport = await this.registry.run(ctx, {
      only: ids,
      timeoutMs: input.timeoutMs,
    });
    const passed = !report.findings.some(isBlocking);
    return {
      gate: input.gateTarget,
      passed,
      findings: report.findings,
      runId: report.runId,
      durationMs: report.durationMs,
      validatorsRun: report.perValidator.map((s) => s.id),
    };
  }
}
