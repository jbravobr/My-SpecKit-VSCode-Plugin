import * as path from 'path';
import type { IFileSystem } from '../../generator/utils/IFileSystem';
import type { Gate } from '../../story/Story';
import { parseStory } from '../../story/StoryParser';
import { gitOps } from '../../workflow/GitOperations';
import { formatFindingLine } from '../../workflow/RevisorFeedbackBridge';
import {
  AcceptanceCriteriaTestPresenceValidator,
  CoverageThresholdValidator,
  CrapValidator,
  SecretLeakValidator,
  StoryHeuristicValidator,
  TestExecutionValidator,
  TypecheckValidator,
  ValidationRegistry,
} from './index';
import type { Finding } from './types';

export interface PreGateDryRunDeps {
  workspaceRoot: string;
  specPath: string;
  fs: IFileSystem;
}

export interface PreGateDryRunResult {
  passed: boolean;
  findings: Finding[];
  blockerCount: number;
  evidencePath?: string;
}

interface InternalPreGateDryRunDeps extends PreGateDryRunDeps {
  registry?: ValidationRegistry;
  changedFiles?: string[];
  now?: () => Date;
}

const PRE_GATE_TARGET: Gate = 3;
const PRE_GATE_VALIDATOR_ID = 'pre-gate-dry-run';

function buildDefaultRegistry(): ValidationRegistry {
  const registry = new ValidationRegistry();
  registry.register(new StoryHeuristicValidator());
  registry.register(new TypecheckValidator());
  registry.register(new AcceptanceCriteriaTestPresenceValidator());
  registry.register(new TestExecutionValidator());
  registry.register(new CoverageThresholdValidator());
  registry.register(new CrapValidator());
  registry.register(new SecretLeakValidator());
  return registry;
}

function createWorkspaceAwareFileSystem(fs: IFileSystem, workspaceRoot: string): IFileSystem {
  async function readWithFallback(filePath: string): Promise<string> {
    if (path.isAbsolute(filePath)) {
      return fs.readFile(filePath);
    }

    try {
      return await fs.readFile(filePath);
    } catch {
      return fs.readFile(path.join(workspaceRoot, filePath));
    }
  }

  async function existsWithFallback(filePath: string): Promise<boolean> {
    if (path.isAbsolute(filePath)) {
      return fs.fileExists(filePath);
    }

    if (await fs.fileExists(filePath)) {
      return true;
    }

    return fs.fileExists(path.join(workspaceRoot, filePath));
  }

  return {
    ensureDir: (dirPath) => fs.ensureDir(dirPath),
    writeFile: (filePath, content) => fs.writeFile(filePath, content),
    readFile: readWithFallback,
    fileExists: existsWithFallback,
    listDir: (dirPath) => fs.listDir(dirPath),
    deleteFile: (filePath) => fs.deleteFile(filePath),
    deleteDir: (dirPath) => fs.deleteDir(dirPath),
  };
}

async function resolveChangedFiles(deps: InternalPreGateDryRunDeps): Promise<string[]> {
  if (deps.changedFiles) {
    return deps.changedFiles;
  }

  if (!gitOps.changedFiles) {
    return [];
  }

  try {
    const againstDevelop = await gitOps.changedFiles(deps.workspaceRoot, 'develop...HEAD');
    if (againstDevelop.length > 0) {
      return againstDevelop;
    }
  } catch {
    // ignore and fallback
  }

  try {
    return await gitOps.changedFiles(deps.workspaceRoot, 'HEAD');
  } catch {
    return [];
  }
}

function buildEvidenceMarkdown(input: {
  workspaceRoot: string;
  specPath: string;
  findings: Finding[];
  passed: boolean;
  blockerCount: number;
  validatorsRun: string[];
  now: Date;
}): string {
  const relativeSpecPath = path.relative(input.workspaceRoot, input.specPath).replace(/\\/g, '/');
  const findingsBody =
    input.findings.length === 0
      ? '✅ Nenhum finding detectado.\n'
      : input.findings.map((finding) => `- ${formatFindingLine(finding)}`).join('\n') + '\n';

  return (
    '# Pre-Gate Dry Run\n\n' +
    `_Gerado em ${input.now.toISOString()} a partir de \`${relativeSpecPath || input.specPath}\`._\n\n` +
    `- Status: **${input.passed ? 'PASSED' : 'BLOCKED'}**\n` +
    `- Gate alvo (dry-run): **${PRE_GATE_TARGET}**\n` +
    `- Findings totais: **${input.findings.length}**\n` +
    `- Blockers: **${input.blockerCount}**\n` +
    `- Validadores executados: ${input.validatorsRun.length > 0 ? input.validatorsRun.map((id) => `\`${id}\``).join(', ') : '_(nenhum)_'}\n\n` +
    '## Findings\n\n' +
    findingsBody
  );
}

export async function runPreGateDryCheck(
  deps: PreGateDryRunDeps,
): Promise<PreGateDryRunResult> {
  const internalDeps = deps as InternalPreGateDryRunDeps;
  const registry = internalDeps.registry ?? buildDefaultRegistry();
  const now = internalDeps.now ?? (() => new Date());
  const evidenceDir = path.join(deps.workspaceRoot, '.speckit', 'evidence');
  const evidencePath = path.join(evidenceDir, 'pre-gate-dry-run.md');
  let findings: Finding[];
  let validatorsRun = registry.list().map((validator) => validator.id);

  try {
    const specContent = await deps.fs.readFile(deps.specPath);
    const story = parseStory(specContent);
    const storyFiles = await resolveChangedFiles(internalDeps);
    const report = await registry.run({
      workspaceRoot: deps.workspaceRoot,
      fs: createWorkspaceAwareFileSystem(deps.fs, deps.workspaceRoot),
      story,
      storyFiles,
      gateTarget: PRE_GATE_TARGET,
    });
    findings = report.findings;
    validatorsRun = report.perValidator.map((validator) => validator.id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    findings = [
      {
        validator: PRE_GATE_VALIDATOR_ID,
        severity: 'error',
        message: `Falha ao executar pre-gate dry-run: ${message}`,
        path: deps.specPath,
      },
    ];
  }

  let blockerCount = findings.filter((finding) => finding.severity === 'blocker').length;
  let passed = !findings.some(
    (finding) => finding.severity === 'blocker' || finding.severity === 'error',
  );

  try {
    await deps.fs.ensureDir(evidenceDir);
    await deps.fs.writeFile(
      evidencePath,
      buildEvidenceMarkdown({
        workspaceRoot: deps.workspaceRoot,
        specPath: deps.specPath,
        findings,
        passed,
        blockerCount,
        validatorsRun,
        now: now(),
      }),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    findings = [
      ...findings,
      {
        validator: PRE_GATE_VALIDATOR_ID,
        severity: 'error',
        message: `Falha ao escrever evidência do pre-gate dry-run: ${message}`,
        path: evidencePath,
      },
    ];
    blockerCount = findings.filter((finding) => finding.severity === 'blocker').length;
    passed = false;
    return {
      passed,
      findings,
      blockerCount,
    };
  }

  return {
    passed,
    findings,
    blockerCount,
    evidencePath,
  };
}
