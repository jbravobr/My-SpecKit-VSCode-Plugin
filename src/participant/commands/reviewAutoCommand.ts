import * as path from 'path';
import * as vscode from 'vscode';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { extractSpecType } from '../../parser/BaseParser';
import { Gate, SpecStatus } from '../../story/Story';
import { parseStory } from '../../story/StoryParser';
import { AuditLogger } from '../../workflow/AuditLogger';
import { emitCommandTelemetry } from '../../workflow/CommandTelemetry';
import { validateGateTransition, validateStatusTransition } from '../../workflow/GateEnforcer';
import { gitOps, IGitOps } from '../../workflow/GitOperations';
import { runGateVerificationHook } from '../../workflow/GateVerificationHook';
import { upsertMetadataFields } from '../../workflow/MetadataPatcher';
import { createCorrelationId } from '../../workflow/ObservabilityContext';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import {
  consumeTransitionIntent,
  createTransitionIntent,
  getBatchSessionConsent,
  setBatchSessionConsent,
} from '../../workflow/TransitionGovernance';
import { requireWorkspace } from './CommandHelpers';

interface CoverageInfo {
  percent?: number;
  linesHit: number;
  linesFound: number;
}

interface LcovFileRecord {
  sourcePath: string;
  normalizedPath: string;
  lineHits: Map<number, number>;
  linesHit: number;
  linesFound: number;
}

interface CoverageSummary extends CoverageInfo {
  byFile: Map<string, LcovFileRecord>;
}

interface FunctionRange {
  name: string;
  startLine: number;
  endLine: number;
}

type CrapAction = 'add-tests' | 'refactor';

interface CrapFinding {
  filePath: string;
  functionName: string;
  startLine: number;
  complexity: number;
  coverage: number;
  crap: number;
  action: CrapAction;
}

interface CrapAnalysis {
  evaluatedFiles: number;
  evaluatedFunctions: number;
  findings: CrapFinding[];
  triggerFiles: string[];
  missingCoverageFiles: string[];
  skippedFiles: string[];
}

interface MutationAssessment {
  command?: string;
  estimatedMinutesMin: number;
  estimatedMinutesMax: number;
  files: string[];
}

interface ReviewEvidence {
  changedFiles: string[];
  coverage: CoverageSummary;
  crap: CrapAnalysis;
  mutation?: MutationAssessment;
}

type MetadataPatchResult = import('../../workflow/MetadataPatcher').MetadataPatchResult;

type ReviewAutoAction = 'orchestrate' | 'approved' | 'changes-requested' | 'mutation';

interface ReviewAutoControl {
  action: ReviewAutoAction;
  auto: boolean;
  batchConsent: boolean;
  confirmIntentId?: string;
  error?: string;
}

interface StoryTransitionSummary {
  fromGate: Gate;
  toGate: Gate;
  fromStatus: SpecStatus;
  toStatus: SpecStatus;
  changed: boolean;
  reason: string;
}

function upsertStoryMetadata(content: string, gate: Gate, status: SpecStatus): MetadataPatchResult {
  return upsertMetadataFields(content, { gate, status });
}

function extractChangedFilesFromDiff(diffOutput: string): string[] {
  const re = /^diff --git a\/(.+?) b\/(.+)$/gm;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = re.exec(diffOutput)) !== null) {
    const candidate = (match[2] || '').trim();
    if (candidate) seen.add(candidate);
  }

  return [...seen];
}

async function collectChangedFiles(workspaceRoot: string, git: IGitOps): Promise<string[]> {
  if (git.changedFiles) {
    try {
      const againstDevelop = await git.changedFiles(workspaceRoot, 'develop...HEAD');
      if (againstDevelop.length > 0) return againstDevelop;
    } catch {
      // ignore and fallback
    }

    try {
      const againstHead = await git.changedFiles(workspaceRoot, 'HEAD');
      if (againstHead.length > 0) return againstHead;
    } catch {
      // ignore and fallback
    }
  }

  try {
    const fullDiff = await git.diff(workspaceRoot, true);
    return extractChangedFilesFromDiff(fullDiff);
  } catch {
    return [];
  }
}

const CRAP_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.java', '.py', '.cs']);

function normalizePathForCompare(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function parseCoverageFromLcov(content: string): CoverageSummary {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const byFile = new Map<string, LcovFileRecord>();
  let currentRecord: LcovFileRecord | undefined;
  let summaryLinesFound = 0;
  let summaryLinesHit = 0;

  for (const line of lines) {
    if (line.startsWith('SF:')) {
      const sourcePath = line.slice(3).trim();
      if (!sourcePath) {
        currentRecord = undefined;
        continue;
      }
      const normalizedPath = normalizePathForCompare(sourcePath);
      currentRecord = {
        sourcePath,
        normalizedPath,
        lineHits: new Map<number, number>(),
        linesFound: 0,
        linesHit: 0,
      };
      byFile.set(normalizedPath, currentRecord);
      continue;
    }

    if (line === 'end_of_record') {
      currentRecord = undefined;
      continue;
    }

    if (!currentRecord || !line.startsWith('DA:')) {
      if (line.startsWith('LF:')) {
        summaryLinesFound += Number.parseInt(line.slice(3), 10) || 0;
      } else if (line.startsWith('LH:')) {
        summaryLinesHit += Number.parseInt(line.slice(3), 10) || 0;
      }
      continue;
    }

    const [rawLine, rawHits] = line.slice(3).split(',');
    const lineNumber = Number.parseInt(rawLine ?? '', 10);
    const hits = Number.parseInt(rawHits ?? '', 10);
    if (!Number.isFinite(lineNumber) || lineNumber <= 0) {
      continue;
    }

    const safeHits = Number.isFinite(hits) && hits > 0 ? hits : 0;
    currentRecord.lineHits.set(lineNumber, safeHits);
    currentRecord.linesFound += 1;
    if (safeHits > 0) {
      currentRecord.linesHit += 1;
    }
  }

  let linesFound = 0;
  let linesHit = 0;
  for (const record of byFile.values()) {
    linesFound += record.linesFound;
    linesHit += record.linesHit;
  }

  if (linesFound <= 0 && summaryLinesFound > 0) {
    linesFound = summaryLinesFound;
    linesHit = summaryLinesHit;
  }

  if (linesFound <= 0) return { linesFound, linesHit, byFile };
  const percent = (linesHit / linesFound) * 100;
  return { linesFound, linesHit, percent, byFile };
}

function resolveCoverageRecord(
  coverage: CoverageSummary,
  relativeFilePath: string,
): LcovFileRecord | undefined {
  const normalized = normalizePathForCompare(relativeFilePath);
  const exact = coverage.byFile.get(normalized);
  if (exact) return exact;

  const suffixMatches = [...coverage.byFile.values()].filter((record) =>
    record.normalizedPath.endsWith(`/${normalized}`),
  );
  if (suffixMatches.length === 1) return suffixMatches[0];
  if (suffixMatches.length > 1) return undefined;

  if (!normalized.includes('/')) {
    const basenameMatches = [...coverage.byFile.values()].filter(
      (record) =>
        record.normalizedPath === normalized || record.normalizedPath.endsWith(`/${normalized}`),
    );
    if (basenameMatches.length === 1) return basenameMatches[0];
  }

  return undefined;
}

function isCrapSupportedSourceFile(filePath: string): boolean {
  return CRAP_SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function detectBraceFunctionName(trimmed: string): string | undefined {
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) {
    return undefined;
  }

  const functionMatch = trimmed.match(
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>{}]+>)?\s*\([^)]*\)\s*(?::[^{}=]+)?\s*\{/,
  );
  if (functionMatch) return functionMatch[1];

  const arrowMatch = trimmed.match(
    /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>\s*\{/,
  );
  if (arrowMatch) return arrowMatch[1];

  const methodMatch = trimmed.match(
    /^(?:public|private|protected|internal|static|final|virtual|override|async|readonly|get|set|\s)*([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*(?::[^{}=]+)?\s*\{/,
  );
  if (!methodMatch) return undefined;

  const name = methodMatch[1];
  if (['if', 'for', 'while', 'switch', 'catch', 'else', 'try', 'do'].includes(name)) {
    return undefined;
  }
  return name;
}

function extractBraceFunctionRanges(content: string): FunctionRange[] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const ranges: FunctionRange[] = [];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const name = detectBraceFunctionName(lines[idx].trim());
    if (!name) continue;

    let balance = 0;
    let seenBrace = false;
    let endLine = lines.length;

    for (let cursor = idx; cursor < lines.length; cursor += 1) {
      const current = lines[cursor];
      for (const char of current) {
        if (char === '{') {
          balance += 1;
          seenBrace = true;
        } else if (char === '}') {
          balance -= 1;
        }
      }

      if (seenBrace && balance <= 0) {
        endLine = cursor + 1;
        break;
      }
    }

    if (!seenBrace) continue;
    ranges.push({ name, startLine: idx + 1, endLine });
    idx = Math.max(idx, endLine - 1);
  }

  return ranges;
}

function extractPythonFunctionRanges(content: string): FunctionRange[] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const ranges: FunctionRange[] = [];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const raw = lines[idx];
    const match = raw.match(/^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/);
    if (!match) continue;

    const baseIndent = raw.match(/^\s*/)?.[0].length ?? 0;
    let endLine = lines.length;

    for (let cursor = idx + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (!candidate.trim()) continue;
      const candidateIndent = candidate.match(/^\s*/)?.[0].length ?? 0;
      if (candidateIndent <= baseIndent && !candidate.trim().startsWith('#')) {
        endLine = cursor;
        break;
      }
    }

    ranges.push({ name: match[1], startLine: idx + 1, endLine });
    idx = Math.max(idx, endLine - 1);
  }

  return ranges;
}

function extractFunctionRanges(content: string, relativeFilePath: string): FunctionRange[] {
  const ext = path.extname(relativeFilePath).toLowerCase();
  if (ext === '.py') {
    return extractPythonFunctionRanges(content);
  }
  return extractBraceFunctionRanges(content);
}

function countOccurrences(content: string, pattern: RegExp): number {
  return content.match(pattern)?.length ?? 0;
}

function estimateCyclomaticComplexity(content: string, relativeFilePath: string): number {
  const ext = path.extname(relativeFilePath).toLowerCase();
  let complexity = 1;

  if (ext === '.py') {
    complexity += countOccurrences(content, /\bif\b/g);
    complexity += countOccurrences(content, /\belif\b/g);
    complexity += countOccurrences(content, /\bfor\b/g);
    complexity += countOccurrences(content, /\bwhile\b/g);
    complexity += countOccurrences(content, /\bexcept\b/g);
    complexity += countOccurrences(content, /\band\b/g);
    complexity += countOccurrences(content, /\bor\b/g);
    return complexity;
  }

  complexity += countOccurrences(content, /\bif\b/g);
  complexity += countOccurrences(content, /\bfor\b/g);
  complexity += countOccurrences(content, /\bwhile\b/g);
  complexity += countOccurrences(content, /\bcase\b/g);
  complexity += countOccurrences(content, /\bcatch\b/g);
  complexity += countOccurrences(content, /&&/g);
  complexity += countOccurrences(content, /\|\|/g);
  return complexity;
}

function calculateFunctionCoverage(
  record: LcovFileRecord,
  startLine: number,
  endLine: number,
): { ratio: number; linesHit: number; linesFound: number } | undefined {
  let linesFound = 0;
  let linesHit = 0;

  for (const [line, hits] of record.lineHits.entries()) {
    if (line < startLine || line > endLine) continue;
    linesFound += 1;
    if (hits > 0) linesHit += 1;
  }

  if (linesFound <= 0) return undefined;
  return { ratio: linesHit / linesFound, linesHit, linesFound };
}

function classifyCrapAction(crap: number, coverageRatio: number): CrapAction {
  if (crap > 50) return 'refactor';
  return coverageRatio < 0.8 ? 'add-tests' : 'refactor';
}

async function evaluateCrapForChangedFiles(
  workspaceRoot: string,
  changedFiles: string[],
  coverage: CoverageSummary,
  fs: IFileSystem,
): Promise<CrapAnalysis> {
  const findings: CrapFinding[] = [];
  const triggerFiles = new Set<string>();
  const missingCoverageFiles = new Set<string>();
  const skippedFiles: string[] = [];
  let evaluatedFiles = 0;
  let evaluatedFunctions = 0;

  for (const changedFile of changedFiles) {
    if (!isCrapSupportedSourceFile(changedFile)) {
      continue;
    }

    const absolutePath = path.join(workspaceRoot, changedFile);
    if (!(await fs.fileExists(absolutePath))) {
      skippedFiles.push(changedFile);
      continue;
    }

    let source: string;
    try {
      source = await fs.readFile(absolutePath);
    } catch {
      skippedFiles.push(changedFile);
      continue;
    }

    evaluatedFiles += 1;
    const ranges = extractFunctionRanges(source, changedFile);
    if (ranges.length === 0) continue;

    const coverageRecord = resolveCoverageRecord(coverage, changedFile);
    if (!coverageRecord) {
      missingCoverageFiles.add(changedFile);
      continue;
    }

    const sourceLines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    for (const range of ranges) {
      const startIndex = Math.max(range.startLine - 1, 0);
      const endIndex = Math.min(range.endLine, sourceLines.length);
      const snippet = sourceLines.slice(startIndex, endIndex).join('\n');
      const complexity = estimateCyclomaticComplexity(snippet, changedFile);
      if (complexity <= 5) continue;

      evaluatedFunctions += 1;
      const coverageSlice = calculateFunctionCoverage(
        coverageRecord,
        range.startLine,
        range.endLine,
      );
      const coverageRatio = coverageSlice?.ratio ?? 0;
      const crap = complexity ** 2 * (1 - coverageRatio) ** 3 + complexity;
      if (crap <= 30) continue;

      const action = classifyCrapAction(crap, coverageRatio);
      findings.push({
        filePath: changedFile,
        functionName: range.name,
        startLine: range.startLine,
        complexity,
        coverage: coverageRatio,
        crap,
        action,
      });
      triggerFiles.add(changedFile);
    }
  }

  findings.sort((left, right) => right.crap - left.crap);
  return {
    evaluatedFiles,
    evaluatedFunctions,
    findings,
    triggerFiles: [...triggerFiles],
    missingCoverageFiles: [...missingCoverageFiles],
    skippedFiles,
  };
}

function formatCrapFindingLine(finding: CrapFinding): string {
  return (
    `${finding.filePath}:${finding.startLine} | ${finding.functionName} | ` +
    `CRAP=${finding.crap.toFixed(2)} | complexity=${finding.complexity} | ` +
    `coverage=${(finding.coverage * 100).toFixed(2)}% | ação=${finding.action}`
  );
}

function estimateMutationWindow(files: string[]): { min: number; max: number } {
  const count = Math.max(files.length, 1);
  return {
    min: 6 * count,
    max: 18 * count,
  };
}

function buildMutationCommand(language: string, files: string[]): string | undefined {
  if (files.length === 0) return undefined;
  const normalizedLanguage = language.trim().toLowerCase();
  const fileList = files.join(',');

  if (normalizedLanguage === 'typescript' || normalizedLanguage === 'javascript') {
    return `npx stryker run --mutate "${fileList}"`;
  }

  if (normalizedLanguage === 'java') {
    const targetClasses = files
      .map((file) => file.replace(/\.[^.]+$/, '').replace(/[\\/]/g, '.'))
      .join(',');
    return `./mvnw org.pitest:pitest-maven:mutationCoverage -DtargetClasses="${targetClasses}"`;
  }

  if (
    normalizedLanguage === 'csharp' ||
    normalizedLanguage === 'dotnet' ||
    normalizedLanguage === 'c#'
  ) {
    return `dotnet stryker --mutate "${fileList}"`;
  }

  if (normalizedLanguage === 'python') {
    return `mutmut run --paths-to-mutate "${fileList}"`;
  }

  return undefined;
}

function buildMutationAssessment(
  language: string,
  crap: CrapAnalysis,
): MutationAssessment | undefined {
  if (crap.findings.length === 0) return undefined;
  const files = crap.triggerFiles;
  const estimate = estimateMutationWindow(files);
  return {
    files,
    command: buildMutationCommand(language, files),
    estimatedMinutesMin: estimate.min,
    estimatedMinutesMax: estimate.max,
  };
}

async function readCoverageEvidence(
  workspaceRoot: string,
  fs: IFileSystem,
): Promise<CoverageSummary> {
  const lcovPath = path.join(workspaceRoot, 'coverage', 'lcov.info');
  const exists = await fs.fileExists(lcovPath);
  if (!exists) return { linesFound: 0, linesHit: 0, byFile: new Map() };
  const content = await fs.readFile(lcovPath);
  return parseCoverageFromLcov(content);
}

function formatCoverage(coverage: CoverageInfo): string {
  if (coverage.percent === undefined) {
    return 'não disponível (lcov ausente ou inválido)';
  }
  return `${coverage.percent.toFixed(2)}% (${coverage.linesHit}/${coverage.linesFound})`;
}

function readFlagValue(tokens: string[], flag: string): string | undefined {
  const normalized = flag.toLowerCase();

  for (let idx = 0; idx < tokens.length; idx += 1) {
    const token = tokens[idx];
    if (token === normalized) {
      const next = tokens[idx + 1];
      if (next && !next.startsWith('--')) return next;
      return undefined;
    }

    if (token.startsWith(`${normalized}=`)) {
      return token.slice(normalized.length + 1).trim();
    }
  }

  return undefined;
}

function parseReviewAutoControl(prompt: string | undefined): ReviewAutoControl {
  const tokens = (prompt ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);

  const approved = tokens.includes('--approved') || tokens.includes('--approve');
  const changesRequested =
    tokens.includes('--changes-requested') ||
    tokens.includes('--changes') ||
    tokens.includes('--rework');
  const mutation = tokens.includes('--mutation') || tokens.includes('--mut');
  const auto = tokens.includes('--auto');
  const batchConsent = tokens.includes('--batch-consent');
  const confirmIntentId = readFlagValue(tokens, '--confirm');

  if (tokens.includes('--confirm') && !confirmIntentId) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      error: 'Use `--confirm <intent-id>` para confirmar uma transição pendente.',
    };
  }

  if (approved && changesRequested) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      error:
        'Flags conflitantes: use apenas uma entre `--approved` e `--changes-requested` no comando `/review-auto`.',
    };
  }

  if (batchConsent && (approved || changesRequested)) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      error:
        'Use `--batch-consent` isoladamente para consentimento de sessão batch ou execute transição separadamente.',
    };
  }

  if (auto && batchConsent) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      error: 'Flags incompatíveis: `--auto` não pode ser combinado com `--batch-consent`.',
    };
  }

  if (mutation && (approved || changesRequested || batchConsent)) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      error:
        'Use `--mutation` isoladamente para análise opcional de mutation testing após avaliação de CRAP.',
    };
  }

  if (mutation && auto) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      error: 'Flags incompatíveis: `--mutation` não pode ser combinado com `--auto`.',
    };
  }

  if (approved) return { action: 'approved', auto, batchConsent, confirmIntentId };
  if (changesRequested) {
    return { action: 'changes-requested', auto, batchConsent, confirmIntentId };
  }
  if (mutation) return { action: 'mutation', auto, batchConsent, confirmIntentId };
  return { action: 'orchestrate', auto, batchConsent, confirmIntentId };
}

function applyStoryTransition(
  content: string,
  fromGate: Gate,
  fromStatus: SpecStatus,
  toGate: Gate,
  toStatus: SpecStatus,
  reason: string,
): { patch: MetadataPatchResult; summary: StoryTransitionSummary } {
  if (fromGate !== toGate) {
    const gateValidation = validateGateTransition(fromGate, toGate);
    if (!gateValidation.allowed) {
      throw new Error(
        `Transição automática de gate bloqueada (${fromGate} → ${toGate}): ${gateValidation.reason ?? 'motivo não informado'}`,
      );
    }
  }

  if (fromStatus !== toStatus) {
    const statusValidation = validateStatusTransition(fromStatus, toStatus);
    if (!statusValidation.allowed) {
      throw new Error(
        `Transição automática de status bloqueada (${fromStatus} → ${toStatus}): ${statusValidation.reason ?? 'motivo não informado'}`,
      );
    }
  }

  const patch = upsertStoryMetadata(content, toGate, toStatus);
  return {
    patch,
    summary: {
      fromGate,
      toGate,
      fromStatus,
      toStatus,
      changed: patch.changed,
      reason,
    },
  };
}

function formatTransitionMarkdown(summary: StoryTransitionSummary): string {
  if (!summary.changed) {
    return (
      `### 🚪 Transição de Gate/Status\n` +
      `- ℹ️ Sem mudança persistida (gate/status já estavam no estado esperado).\n` +
      `- Motivo: ${summary.reason}\n`
    );
  }

  return (
    `### 🚪 Transição de Gate/Status\n` +
    `| Campo | Antes | Depois |\n` +
    `| --- | --- | --- |\n` +
    `| Gate | \`${summary.fromGate}\` | \`${summary.toGate}\` |\n` +
    `| Status | \`${summary.fromStatus}\` | \`${summary.toStatus}\` |\n` +
    `\n` +
    `**Motivo:** ${summary.reason}\n`
  );
}

interface ReviewAutoRecordInput {
  command: string;
  outcome: string;
  detail?: string;
  gate: Gate;
  commandExecutionId: string;
  specId: string;
  specTitle: string;
  workspaceRoot: string;
  fs: IFileSystem;
  audit: AuditLogger;
  tracer: TraceabilityManager;
}

async function recordReviewAutoEvent(input: ReviewAutoRecordInput): Promise<void> {
  await emitCommandTelemetry({
    workspaceRoot: input.workspaceRoot,
    fs: input.fs,
    audit: input.audit,
    tracer: input.tracer,
    command: input.command,
    outcome: input.outcome,
    detail: input.detail,
    commandExecutionId: input.commandExecutionId,
    specId: input.specId,
    specTitle: input.specTitle,
    specType: 'story',
    gate: input.gate,
    llmResponseReceived: true,
    traceType: 'custom',
    traceDescription: `review-auto event: ${input.outcome}`,
  });
}

interface TransitionProposal {
  toGate: Gate;
  toStatus: SpecStatus;
  reason: string;
  commandLabel: string;
}

function buildTransitionProposal(action: ReviewAutoAction): TransitionProposal | undefined {
  if (action === 'approved') {
    return {
      toGate: 4,
      toStatus: 'ready-to-commit',
      reason: 'Veredito APROVADO confirmado no Gate 3. Gate 4 aguardando commit final.',
      commandLabel: '/review-auto --approved',
    };
  }

  if (action === 'changes-requested') {
    return {
      toGate: 2,
      toStatus: 'in-progress',
      reason: 'Veredito ALTERAÇÕES SOLICITADAS no Gate 3.',
      commandLabel: '/review-auto --changes-requested',
    };
  }

  return {
    toGate: 3,
    toStatus: 'review',
    reason: 'Handoff implementador → revisor orquestrado automaticamente.',
    commandLabel: '/review-auto',
  };
}

function formatTransitionProposalMarkdown(
  storyId: string,
  intentId: string,
  fromGate: Gate,
  toGate: Gate,
  fromStatus: SpecStatus,
  toStatus: SpecStatus,
  reason: string,
  confirmCommand: string,
): string {
  return (
    `## ⚠️ Confirmação obrigatória de transição — STORY-${storyId}\n\n` +
    `### 🚪 Transição de Gate/Status (proposta)\n` +
    `| Campo | Antes | Depois |\n` +
    `| --- | --- | --- |\n` +
    `| Gate | \`${fromGate}\` | \`${toGate}\` |\n` +
    `| Status | \`${fromStatus}\` | \`${toStatus}\` |\n\n` +
    `**Motivo:** ${reason}\n\n` +
    `Intent-ID: \`${intentId}\`\n\n` +
    `Para confirmar explicitamente, execute:\n` +
    `- \`${confirmCommand}\`\n\n` +
    `Sem esta confirmação, nenhuma alteração de gate/status será persistida.\n`
  );
}

function formatBatchConsentProposalMarkdown(intentId: string): string {
  return (
    '## ⚠️ Consentimento único obrigatório — sessão batch unificada\n\n' +
    'Este consentimento autoriza handoffs automáticos **somente** nesta sessão do batch.\n\n' +
    `Intent-ID: \`${intentId}\`\n\n` +
    'Para confirmar explicitamente, execute:\n' +
    `- \`@speckit /review-auto --batch-consent --confirm ${intentId}\`\n\n` +
    'Sem este consentimento, qualquer transição com `--auto` será bloqueada.\n'
  );
}

function emitChatQuickActionButton(
  stream: vscode.ChatResponseStream,
  title: string,
  query: string,
): void {
  const command: vscode.Command = {
    title,
    command: 'speckit.runChatQuickAction',
    arguments: [query],
  };

  if (typeof stream.button === 'function') {
    stream.button(command);
    return;
  }

  if (typeof stream.push === 'function') {
    stream.push(new vscode.ChatResponseCommandButtonPart(command));
  }
}

interface ContextualCommand {
  command: string;
  description: string;
}

function emitContextualCommands(
  stream: vscode.ChatResponseStream,
  commands: ContextualCommand[],
  note?: string,
): void {
  const lines = commands.map((item) => `- \`${item.command}\` (${item.description})`).join('\n');
  stream.markdown(
    '### Comandos disponíveis agora (contextuais)\n' + `${lines}\n` + (note ? `\n> ${note}\n` : ''),
  );
}

export async function handleReviewAutoCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  workspace: IWorkspace = vscodeWorkspace,
  fs: IFileSystem = vscodeFileSystem,
  git: IGitOps = gitOps,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;
  const workspaceRootPath = workspaceRoot;

  const commandExecutionId = createCorrelationId('exec');
  const audit = new AuditLogger(workspaceRootPath, fs);
  const tracer = new TraceabilityManager(workspaceRootPath, fs);

  const activeSpecPath = await workspace.getActiveSpecPath();
  if (!activeSpecPath) {
    await emitCommandTelemetry({
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
      command: '/review-auto',
      outcome: '⛔ bloqueado: nenhuma spec ativa',
      detail: 'Seleção de story ativa é obrigatória para revisão automática.',
      commandExecutionId,
      specId: 'GLOBAL-REVIEW-AUTO',
      specTitle: 'Review Auto Command',
      specType: 'story',
      llmResponseReceived: true,
    });

    stream.markdown(
      '❌ Nenhuma spec ativa encontrada. Execute `@speckit /status` e selecione uma story em andamento.\n',
    );
    emitContextualCommands(stream, [
      { command: '@speckit /status', description: 'listar stories/fixes e identificar a ativa' },
      {
        command: '@speckit /status --all',
        description: 'incluir specs done/cancelled na listagem',
      },
    ]);
    emitChatQuickActionButton(stream, '📊 Ver Status das Specs', '@speckit /status');
    return;
  }
  const activeStoryPath = activeSpecPath;

  const content = await fs.readFile(activeStoryPath);
  const specType = extractSpecType(content);
  if (specType !== 'story') {
    await emitCommandTelemetry({
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
      command: '/review-auto',
      outcome: '⛔ bloqueado: tipo de spec não suportado',
      detail: `Tipo detectado: ${specType}`,
      commandExecutionId,
      specId: 'GLOBAL-REVIEW-AUTO',
      specTitle: 'Review Auto Command',
      specType: 'story',
      llmResponseReceived: true,
    });

    stream.markdown('❌ `/review-auto` está disponível apenas para Story no momento.\n');
    emitContextualCommands(stream, [
      { command: '@speckit /status', description: 'localizar e selecionar uma Story ativa' },
      { command: '@speckit /status --all', description: 'inspecionar todas as specs da sessão' },
    ]);
    emitChatQuickActionButton(stream, '📊 Ver Status das Specs', '@speckit /status');
    return;
  }

  const story = parseStory(content);
  const control = parseReviewAutoControl(request.prompt);

  if (control.error) {
    await recordReviewAutoEvent({
      command: '/review-auto',
      outcome: '❌ comando bloqueado por parâmetros inválidos',
      detail: control.error,
      gate: story.metadata.gate,
      commandExecutionId,
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
    });

    stream.markdown(
      `❌ ${control.error}\n\n` +
        '**Uso suportado:**\n' +
        '- `@speckit /review-auto` (orquestra Gate 2 → Gate 3 e revisão automática)\n' +
        '- `@speckit /review-auto --changes-requested` (Gate 3 → Gate 2 para retrabalho)\n' +
        '- `@speckit /review-auto --approved` (Gate 3 → Gate 4 com status ready-to-commit)\n' +
        '- `@speckit /review-auto --mutation` (trilha opcional de mutation testing quando CRAP > 30)\n' +
        '- `@speckit /review-auto --batch-consent` (propõe consentimento único da sessão batch)\n' +
        '- `@speckit /review-auto --confirm <intent-id>` (confirma transição pendente)\n',
    );
    emitContextualCommands(stream, [
      { command: '@speckit /review-auto', description: 'orquestrar handoff para Gate 3' },
      {
        command: '@speckit /review-auto --batch-consent',
        description: 'iniciar consentimento batch',
      },
      {
        command: '@speckit /review-auto --confirm <intent-id>',
        description: 'confirmar transição/consentimento pendente',
      },
    ]);
    return;
  }

  let cachedEvidence: ReviewEvidence | undefined;
  async function getReviewEvidence(): Promise<ReviewEvidence> {
    if (cachedEvidence) return cachedEvidence;

    const changedFiles = await collectChangedFiles(workspaceRootPath, git);
    const coverage = await readCoverageEvidence(workspaceRootPath, fs);
    const crap = await evaluateCrapForChangedFiles(workspaceRootPath, changedFiles, coverage, fs);
    const mutation = buildMutationAssessment(story.technicalSpec.language ?? '', crap);
    cachedEvidence = { changedFiles, coverage, crap, mutation };
    return cachedEvidence;
  }

  if (control.batchConsent) {
    if (!control.confirmIntentId) {
      const consentIntent = await createTransitionIntent(workspaceRootPath, fs, {
        kind: 'batch-consent',
        command: '/review-auto --batch-consent',
        payload: {
          specId: story.metadata.id,
          specTitle: story.metadata.title,
        },
        ttlMinutes: 30,
      });

      await recordReviewAutoEvent({
        command: '/review-auto --batch-consent',
        outcome: '⏳ consentimento batch pendente de confirmação explícita',
        detail: `Intent-ID: ${consentIntent.id}`,
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(formatBatchConsentProposalMarkdown(consentIntent.id));
      emitContextualCommands(
        stream,
        [
          {
            command: `@speckit /review-auto --batch-consent --confirm ${consentIntent.id}`,
            description: 'confirmar consentimento proposto',
          },
          {
            command: '@speckit /review-auto --batch-consent',
            description: 'descartar intent atual e gerar novo',
          },
          { command: '@speckit /status', description: 'ver contexto atual antes de confirmar' },
        ],
        'Para trocar a estratégia de revisão, descreva no chat o motivo antes de confirmar.',
      );
      emitChatQuickActionButton(
        stream,
        '✅ Confirmar Consentimento Batch',
        `@speckit /review-auto --batch-consent --confirm ${consentIntent.id}`,
      );
      return;
    }

    const consentIntent = await consumeTransitionIntent(
      workspaceRootPath,
      fs,
      control.confirmIntentId,
      'batch-consent',
    );

    if (!consentIntent) {
      await recordReviewAutoEvent({
        command: '/review-auto --batch-consent',
        outcome: '❌ consentimento batch bloqueado (intent inválido/expirado)',
        detail: `Intent-ID: ${control.confirmIntentId}`,
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        `❌ Intent-ID inválido ou expirado: \`${control.confirmIntentId}\`. Gere um novo consentimento com \`@speckit /review-auto --batch-consent\`.\n`,
      );
      emitContextualCommands(stream, [
        {
          command: '@speckit /review-auto --batch-consent',
          description: 'gerar novo consentimento batch',
        },
        {
          command: '@speckit /status',
          description: 'revisar contexto antes de novo consentimento',
        },
      ]);
      emitChatQuickActionButton(
        stream,
        '🔁 Gerar Novo Consentimento Batch',
        '@speckit /review-auto --batch-consent',
      );
      return;
    }

    const consent = await setBatchSessionConsent(workspaceRootPath, fs, {
      commandExecutionId,
      note: `Batch consent confirmed from intent ${consentIntent.id}`,
      ttlMinutes: 240,
    });

    await recordReviewAutoEvent({
      command: '/review-auto --batch-consent',
      outcome: '✅ consentimento único de sessão batch habilitado',
      detail: `Consent-ID: ${consent.id}`,
      gate: story.metadata.gate,
      commandExecutionId,
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
    });

    stream.markdown(
      '✅ Consentimento único da sessão batch registrado com sucesso.\n\n' +
        'Agora comandos com `--auto` podem executar handoffs automáticos durante esta sessão.\n',
    );
    emitContextualCommands(stream, [
      {
        command: '@speckit /review-auto --auto',
        description: 'executar handoff automático para Gate 3',
      },
      {
        command: '@speckit /review-auto --changes-requested --auto',
        description: 'registrar retrabalho automático no Gate 3',
      },
      {
        command: '@speckit /review-auto --approved --auto',
        description: 'registrar aprovação automática no Gate 3',
      },
    ]);
    emitChatQuickActionButton(
      stream,
      '🚀 Executar Handoff para Gate 3',
      '@speckit /review-auto --auto',
    );
    return;
  }

  if (story.metadata.status === 'done' || story.metadata.status === 'cancelled') {
    await recordReviewAutoEvent({
      command: '/review-auto',
      outcome: '⛔ bloqueado: status terminal',
      detail: `Status atual: ${story.metadata.status}`,
      gate: story.metadata.gate,
      commandExecutionId,
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
    });

    stream.markdown(
      `❌ Story \`${story.metadata.id}\` já está em status terminal (\`${story.metadata.status}\`). Revisão automática não aplicável.\n`,
    );
    emitContextualCommands(stream, [
      { command: '@speckit /status --all', description: 'consultar histórico completo de specs' },
      { command: '@speckit /status', description: 'selecionar outra story não terminal' },
    ]);
    emitChatQuickActionButton(stream, '📊 Ver Status das Specs', '@speckit /status');
    return;
  }

  if (control.auto) {
    const batchConsent = await getBatchSessionConsent(workspaceRootPath, fs);
    if (!batchConsent) {
      await recordReviewAutoEvent({
        command: '/review-auto --auto',
        outcome: '⛔ bloqueado: consentimento batch ausente',
        detail:
          'Execute /review-auto --batch-consent e confirme explicitamente antes de usar --auto.',
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        '❌ Transição automática bloqueada: consentimento único da sessão batch não encontrado.\n\n' +
          'Execute e confirme:\n' +
          '- `@speckit /review-auto --batch-consent`\n',
      );
      emitContextualCommands(stream, [
        {
          command: '@speckit /review-auto --batch-consent',
          description: 'iniciar consentimento obrigatório da sessão',
        },
        {
          command: '@speckit /review-auto --batch-consent --confirm <intent-id>',
          description: 'confirmar consentimento pendente',
        },
      ]);
      emitChatQuickActionButton(
        stream,
        '✅ Iniciar Consentimento Batch',
        '@speckit /review-auto --batch-consent',
      );
      return;
    }
  }

  async function proposeOrApplyTransition(
    proposal: TransitionProposal,
  ): Promise<{ summary?: StoryTransitionSummary; applied: boolean }> {
    const confirmCommand = `@speckit /review-auto --confirm`;

    if (!control.auto && !control.confirmIntentId) {
      const intent = await createTransitionIntent(workspaceRootPath, fs, {
        kind: 'gate-transition',
        command: proposal.commandLabel,
        payload: {
          specId: story.metadata.id,
          fromGate: String(story.metadata.gate),
          toGate: String(proposal.toGate),
          fromStatus: story.metadata.status,
          toStatus: proposal.toStatus,
          reason: proposal.reason,
        },
        ttlMinutes: 30,
      });

      await recordReviewAutoEvent({
        command: proposal.commandLabel,
        outcome: '⏳ transição proposta aguardando confirmação explícita',
        detail: `Intent-ID: ${intent.id}`,
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        formatTransitionProposalMarkdown(
          story.metadata.id,
          intent.id,
          story.metadata.gate,
          proposal.toGate,
          story.metadata.status,
          proposal.toStatus,
          proposal.reason,
          `${confirmCommand} ${intent.id}`,
        ),
      );
      emitContextualCommands(stream, [
        {
          command: `${confirmCommand} ${intent.id}`,
          description: 'confirmar transição proposta',
        },
        {
          command: `@speckit ${proposal.commandLabel}`,
          description: 'gerar nova proposta de transição',
        },
        { command: '@speckit /status', description: 'consultar estado antes de confirmar' },
      ]);
      emitChatQuickActionButton(
        stream,
        '✅ Confirmar Transição Proposta',
        `${confirmCommand} ${intent.id}`,
      );
      return { applied: false };
    }

    let toGate = proposal.toGate;
    let toStatus = proposal.toStatus;
    let reason = proposal.reason;

    if (!control.auto && control.confirmIntentId) {
      const intent = await consumeTransitionIntent(
        workspaceRootPath,
        fs,
        control.confirmIntentId,
        'gate-transition',
      );
      if (!intent) {
        await recordReviewAutoEvent({
          command: proposal.commandLabel,
          outcome: '❌ confirmação rejeitada: intent inválido/expirado',
          detail: `Intent-ID: ${control.confirmIntentId}`,
          gate: story.metadata.gate,
          commandExecutionId,
          specId: story.metadata.id,
          specTitle: story.metadata.title,
          workspaceRoot: workspaceRootPath,
          fs,
          audit,
          tracer,
        });

        stream.markdown(
          `❌ Intent-ID inválido ou expirado: \`${control.confirmIntentId}\`. Gere nova proposta de transição e confirme novamente.\n`,
        );
        emitContextualCommands(stream, [
          {
            command: `@speckit ${proposal.commandLabel}`,
            description: 'gerar nova proposta de transição',
          },
          { command: '@speckit /status', description: 'consultar status antes da nova proposta' },
        ]);
        emitChatQuickActionButton(
          stream,
          '🔁 Gerar Nova Proposta',
          `@speckit ${proposal.commandLabel}`,
        );
        return { applied: false };
      }

      const intentSpecId = intent.payload.specId;
      const intentFromGate = Number.parseInt(intent.payload.fromGate ?? '', 10);
      const intentFromStatus = intent.payload.fromStatus as SpecStatus;
      if (
        intentSpecId !== story.metadata.id ||
        intentFromGate !== story.metadata.gate ||
        intentFromStatus !== story.metadata.status
      ) {
        await recordReviewAutoEvent({
          command: proposal.commandLabel,
          outcome: '❌ confirmação rejeitada: estado da story divergiu da proposta',
          detail:
            `Intent-ID: ${intent.id}\n` +
            `Esperado: gate ${intent.payload.fromGate}, status ${intent.payload.fromStatus}\n` +
            `Atual: gate ${story.metadata.gate}, status ${story.metadata.status}`,
          gate: story.metadata.gate,
          commandExecutionId,
          specId: story.metadata.id,
          specTitle: story.metadata.title,
          workspaceRoot: workspaceRootPath,
          fs,
          audit,
          tracer,
        });

        stream.markdown(
          '❌ A story mudou após a proposta de transição. Gere uma nova proposta e confirme novamente para manter rastreabilidade consistente.\n',
        );
        emitContextualCommands(stream, [
          {
            command: `@speckit ${proposal.commandLabel}`,
            description: 'recriar proposta com estado atualizado da story',
          },
          {
            command: '@speckit /status',
            description: 'validar gate/status atual antes de reconfirmar',
          },
        ]);
        emitChatQuickActionButton(
          stream,
          '🔁 Gerar Nova Proposta',
          `@speckit ${proposal.commandLabel}`,
        );
        return { applied: false };
      }

      toGate = Number.parseInt(intent.payload.toGate ?? '', 10) as Gate;
      toStatus = intent.payload.toStatus as SpecStatus;
      reason = intent.payload.reason ?? proposal.reason;
    }

    const { patch, summary } = applyStoryTransition(
      content,
      story.metadata.gate,
      story.metadata.status,
      toGate,
      toStatus,
      reason,
    );

    if (patch.changed) {
      await fs.writeFile(activeStoryPath, patch.content);
      // Commit spec metadata atomically so gate state is captured in git before
      // the user interacts with Keep/Undo on the Copilot Edits bar.
      const metaCommitMsg =
        `chore(speckit/${story.metadata.id}): gate ${summary.fromGate}→${summary.toGate}` +
        ` [${summary.toStatus}]`;
      await git.commitFile(workspaceRootPath, activeStoryPath, metaCommitMsg).catch(() => {
        // Silent: git may be unavailable or the file may already be committed.
      });

      // Best-effort deterministic gate verification — writes evidence to
      // `.speckit/evidence/` so the Revisor agent can consume it without depending
      // on the user. Never throws; never blocks the transition.
      try {
        const verification = await runGateVerificationHook({
          workspaceRoot: workspaceRootPath,
          fs,
          git,
          story: { ...story, metadata: { ...story.metadata, gate: summary.toGate } },
          toGate: summary.toGate,
        });
        const evRel = verification.latestPath
          .replace(workspaceRootPath.replace(/\\/g, '/'), '.')
          .replace(/^\.\//, '');
        stream.markdown(
          `\n${verification.report.passed ? '✅' : '🛑'} **Validação determinística Gate ${summary.toGate}:** ` +
            `${verification.report.findings.length} finding(s), ${verification.report.passed ? 'sem bloqueadores' : 'com bloqueadores'}. ` +
            `Evidência: \`${evRel}\`.\n`,
        );
      } catch {
        // Hook is informational; failures must not affect the transition.
      }
    }

    return { applied: true, summary };
  }

  if (control.action === 'approved') {
    if (story.metadata.gate !== 3) {
      await recordReviewAutoEvent({
        command: '/review-auto --approved',
        outcome: '⛔ bloqueado: gate inválido para encerramento',
        detail: `Gate atual: ${story.metadata.gate}. Gate esperado: 3.`,
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. O encerramento automático exige Gate 3 com revisão concluída.\n`,
      );
      emitContextualCommands(stream, [
        { command: '@speckit /status', description: 'consultar gate/status atual da story' },
        {
          command: '@speckit /review-auto',
          description: 'executar revisão quando estiver em Gate 3/review',
        },
      ]);
      emitChatQuickActionButton(stream, '📊 Ver Status das Specs', '@speckit /status');
      return;
    }

    try {
      const proposal = buildTransitionProposal('approved');
      if (!proposal) {
        stream.markdown('❌ Não foi possível montar a proposta de transição de aprovação.\n');
        emitContextualCommands(stream, [
          {
            command: '@speckit /review-auto --approved',
            description: 'tentar gerar nova proposta de aprovação',
          },
          { command: '@speckit /status', description: 'verificar estado atual da story' },
        ]);
        return;
      }

      const transitioned = await proposeOrApplyTransition(proposal);
      if (!transitioned.applied || !transitioned.summary) return;

      const summary = transitioned.summary;

      if (summary.toGate !== 4 || summary.toStatus !== 'ready-to-commit') {
        stream.markdown(
          '❌ A confirmação recebida não representa avanço para Gate 4/status ready-to-commit.\n',
        );
        emitContextualCommands(stream, [
          {
            command: '@speckit /review-auto --approved',
            description: 'emitir nova proposta de aprovação',
          },
          { command: '@speckit /status', description: 'validar o estado atual da story' },
        ]);
        return;
      }

      await recordReviewAutoEvent({
        command: '/review-auto --approved',
        outcome: '✅ Veredito APROVADO — Gate 4 aguardando commit final para done',
        detail: `Gate: ${summary.fromGate} -> ${summary.toGate}\nStatus: ${summary.fromStatus} -> ${summary.toStatus}`,
        gate: 4,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        `## ✅ Gate 4 Orquestrado — STORY-${story.metadata.id}\n\n` +
          `${formatTransitionMarkdown(summary)}\n\n` +
          '### O que aconteceu\n' +
          '- ✅ Metadata da story atualizado para **Gate 4 / ready-to-commit**\n' +
          '- ✅ Metadata commitado automaticamente no git\n\n' +
          '### Próximo passo obrigatório — Commit final para concluir a story\n\n' +
          '> O código criado durante esta story ainda aguarda sua aceitação.\n' +
          '> **1.** Clique em **Keep** na barra acima para aceitar os arquivos gerados\n' +
          '> **2.** Clique no botão abaixo para commitar tudo e concluir o status em **done**\n',
      );
      emitContextualCommands(stream, [
        { command: '@speckit /commit', description: 'commitar código gerado após clicar Keep' },
        {
          command: '@speckit /status --all',
          description: 'confirmar story em Gate 4 / ready-to-commit antes do commit final',
        },
      ]);
      emitChatQuickActionButton(stream, '📦 Commitar Código Gerado', '@speckit /commit');
      emitChatQuickActionButton(stream, '📊 Ver Status Completo', '@speckit /status --all');
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`❌ ${msg}\n`);
      emitContextualCommands(stream, [
        {
          command: '@speckit /review-auto --approved',
          description: 'reexecutar fluxo de aprovação',
        },
        {
          command: '@speckit /status',
          description: 'inspecionar estado antes de tentar novamente',
        },
      ]);
      return;
    }
  }

  if (control.action === 'changes-requested') {
    const allowFromGate3 = story.metadata.gate === 3;
    const allowFromGate4Pending =
      story.metadata.gate === 4 && story.metadata.status === 'ready-to-commit';
    if (!allowFromGate3 && !allowFromGate4Pending) {
      await recordReviewAutoEvent({
        command: '/review-auto --changes-requested',
        outcome: '⛔ bloqueado: gate inválido para retorno ao retrabalho',
        detail:
          `Gate atual: ${story.metadata.gate} / status ${story.metadata.status}. ` +
          'Gate esperado: 3 (review) ou 4 (ready-to-commit).',
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        `❌ Story \`${story.metadata.id}\` está em Gate/Status incompatível. O retorno para retrabalho exige Gate 3 (review) ou Gate 4 (ready-to-commit).\n`,
      );
      emitContextualCommands(stream, [
        { command: '@speckit /status', description: 'consultar gate/status atual da story' },
        {
          command: '@speckit /review-auto',
          description: 'executar revisão quando estiver em Gate 3/review',
        },
      ]);
      emitChatQuickActionButton(stream, '📊 Ver Status das Specs', '@speckit /status');
      return;
    }

    try {
      const proposal = buildTransitionProposal('changes-requested');
      if (!proposal) {
        stream.markdown('❌ Não foi possível montar a proposta de retorno para retrabalho.\n');
        emitContextualCommands(stream, [
          {
            command: '@speckit /review-auto --changes-requested',
            description: 'tentar gerar nova proposta de retrabalho',
          },
          { command: '@speckit /status', description: 'verificar estado atual da story' },
        ]);
        return;
      }

      const transitioned = await proposeOrApplyTransition(proposal);
      if (!transitioned.applied || !transitioned.summary) return;

      const summary = transitioned.summary;

      if (summary.toGate !== 2 || summary.toStatus !== 'in-progress') {
        stream.markdown(
          '❌ A confirmação recebida não representa retorno ao Gate 2/status in-progress.\n',
        );
        emitContextualCommands(stream, [
          {
            command: '@speckit /review-auto --changes-requested',
            description: 'emitir nova proposta de retorno para retrabalho',
          },
          { command: '@speckit /status', description: 'validar o estado atual da story' },
        ]);
        return;
      }

      await recordReviewAutoEvent({
        command: '/review-auto --changes-requested',
        outcome: '🔄 Alterações solicitadas — retorno para Gate 2 (implementação)',
        detail: `Gate: ${summary.fromGate} -> ${summary.toGate}\nStatus: ${summary.fromStatus} -> ${summary.toStatus}`,
        gate: 2,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        `## 🔄 Retorno Orquestrado para Retrabalho — STORY-${story.metadata.id}\n\n` +
          `${formatTransitionMarkdown(summary)}\n\n` +
          '### Próximo passo\n' +
          '- Retorne ao modo implementador e aplique apenas os FIXes aprovados no plano de revisão.\n' +
          '- Após concluir os FIXes e revalidar testes/cobertura, execute `@speckit /review-auto` para novo ciclo de revisão.\n',
      );
      emitContextualCommands(
        stream,
        [
          {
            command: '@speckit /review-auto',
            description: 'abrir novo ciclo de revisão no Gate 3',
          },
          { command: '@speckit /status', description: 'confirmar retorno em Gate 2 / in-progress' },
        ],
        'A decisão de quais FIXes aplicar deve ser descrita no chat antes da nova execução.',
      );
      emitChatQuickActionButton(
        stream,
        '🧪 Novo Ciclo de Revisão (Gate 3)',
        '@speckit /review-auto',
      );
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`❌ ${msg}\n`);
      emitContextualCommands(stream, [
        {
          command: '@speckit /review-auto --changes-requested',
          description: 'reexecutar fluxo de retorno para retrabalho',
        },
        {
          command: '@speckit /status',
          description: 'inspecionar estado antes de tentar novamente',
        },
      ]);
      return;
    }
  }

  if (story.metadata.gate < 2) {
    await recordReviewAutoEvent({
      command: '/review-auto',
      outcome: '⛔ bloqueado: gate abaixo do mínimo para revisão',
      detail: `Gate atual: ${story.metadata.gate}`,
      gate: story.metadata.gate,
      commandExecutionId,
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
    });

    stream.markdown(
      `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. A revisão automática exige conclusão prévia dos Gates 0-2.\n`,
    );
    emitContextualCommands(stream, [
      { command: '@speckit /status', description: 'validar gate/status atual da story' },
      {
        command: '@speckit /review-auto',
        description: 'reexecutar quando Gate 2 estiver concluído',
      },
    ]);
    emitChatQuickActionButton(stream, '📊 Ver Status das Specs', '@speckit /status');
    return;
  }

  if (story.metadata.gate > 3) {
    await recordReviewAutoEvent({
      command: '/review-auto',
      outcome: '⛔ bloqueado: gate acima da janela de revisão',
      detail: `Gate atual: ${story.metadata.gate}`,
      gate: story.metadata.gate,
      commandExecutionId,
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
    });

    stream.markdown(
      `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. Para novos ciclos de revisão, retorne antes ao Gate 2 via fluxo de correções.\n`,
    );
    emitContextualCommands(stream, [
      {
        command: '@speckit /review-auto --changes-requested',
        description: 'propor retorno para Gate 2 quando aplicável',
      },
      { command: '@speckit /status --all', description: 'inspecionar estado geral das specs' },
    ]);
    emitChatQuickActionButton(stream, '📦 Ver Status Completo (--all)', '@speckit /status --all');
    return;
  }

  if (control.action === 'mutation') {
    const evidence = await getReviewEvidence();
    const findingsLines =
      evidence.crap.findings.length > 0
        ? evidence.crap.findings
            .map((finding) => `- \`${formatCrapFindingLine(finding)}\``)
            .join('\n')
        : '- 🔵 Mutation dispensado: nenhum arquivo alterado com CRAP > 30.';

    const mutationSection = evidence.mutation
      ? `### 🧬 Mutation testing (opcional por decisão do usuário)\n` +
        'Mutation testing cria pequenas alterações artificiais no código para validar se os testes detectam regressões reais.\n' +
        `- Escopo sugerido (apenas arquivos com CRAP > 30): \`${evidence.mutation.files.join(', ')}\`\n` +
        `- Estimativa de execução local: **${evidence.mutation.estimatedMinutesMin}–${evidence.mutation.estimatedMinutesMax} min**\n` +
        `- Comando sugerido: \`${evidence.mutation.command ?? 'defina ferramenta de mutation da stack antes de executar'}\`\n\n` +
        'Caminhos possíveis:\n' +
        '1. **Continuar sem mutation agora:** seguir fluxo padrão de correção/revisão.\n' +
        '2. **Aplicar mutation agora:** executar o comando sugerido, matar survivors críticos e revalidar Gate 3.\n'
      : '### 🧬 Mutation testing (opcional)\n- 🔵 Dispensado neste ciclo: CRAP ≤ 30 em todos os arquivos avaliados.\n';

    await recordReviewAutoEvent({
      command: '/review-auto --mutation',
      outcome:
        evidence.crap.findings.length > 0
          ? '🧬 trilha opcional de mutation apresentada'
          : '🔵 mutation dispensado por ausência de gatilho CRAP',
      detail:
        `Arquivos alterados: ${evidence.changedFiles.length}\n` +
        `CRAP findings: ${evidence.crap.findings.length}\n` +
        `Arquivos com gatilho: ${evidence.crap.triggerFiles.length}`,
      gate: story.metadata.gate,
      commandExecutionId,
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
    });

    stream.markdown(
      `## 🧪 Avaliação de Mutation — STORY-${story.metadata.id}\n\n` +
        `### Resultado CRAP (gatilho)\n` +
        `- Funções avaliadas (CC > 5): ${evidence.crap.evaluatedFunctions}\n` +
        `- Findings CRAP > 30: ${evidence.crap.findings.length}\n` +
        `${findingsLines}\n\n` +
        `${mutationSection}`,
    );
    emitContextualCommands(stream, [
      {
        command: '@speckit /review-auto --changes-requested',
        description: 'seguir fluxo padrão sem mutation (retrabalho no Gate 2)',
      },
      {
        command: '@speckit /review-auto',
        description: 'seguir revisão formal Gate 3 sem mutation',
      },
      {
        command: '@speckit /status',
        description: 'inspecionar gate/status antes da decisão',
      },
    ]);

    if (evidence.mutation) {
      emitChatQuickActionButton(stream, '🔄 Continuar sem Mutation', '@speckit /review-auto');
    }
    return;
  }

  let transitionSummary: StoryTransitionSummary = {
    fromGate: story.metadata.gate,
    toGate: story.metadata.gate,
    fromStatus: story.metadata.status,
    toStatus: story.metadata.status,
    changed: false,
    reason: 'Story já estava em modo de revisão (gate/status preservados).',
  };

  if (story.metadata.gate === 2 || story.metadata.status !== 'review') {
    try {
      const proposal = buildTransitionProposal('orchestrate');
      if (!proposal) {
        stream.markdown('❌ Não foi possível montar a proposta de handoff para revisão.\n');
        emitContextualCommands(stream, [
          {
            command: '@speckit /review-auto',
            description: 'tentar gerar nova proposta de handoff',
          },
          { command: '@speckit /status', description: 'verificar estado atual da story' },
        ]);
        return;
      }

      const transitioned = await proposeOrApplyTransition(proposal);
      if (!transitioned.applied || !transitioned.summary) return;
      transitionSummary = transitioned.summary;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await recordReviewAutoEvent({
        command: '/review-auto',
        outcome: '❌ erro ao aplicar transição para Gate 3',
        detail: msg,
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(`❌ ${msg}\n`);
      emitContextualCommands(stream, [
        { command: '@speckit /review-auto', description: 'reexecutar fluxo de revisão automática' },
        {
          command: '@speckit /status',
          description: 'inspecionar estado antes de tentar novamente',
        },
      ]);
      return;
    }
  }

  const evidence = await getReviewEvidence();
  const changedFiles = evidence.changedFiles;
  const coverage = evidence.coverage;
  const crap = evidence.crap;

  const blockers: string[] = [];
  if (changedFiles.length === 0) {
    blockers.push(
      'Nenhum arquivo foi detectado automaticamente no diff para revisão. Valide o range da branch (ex.: develop...HEAD).',
    );
  }
  if (coverage.percent === undefined) {
    blockers.push(
      'Evidência de cobertura não encontrada (coverage/lcov.info ausente ou inválido).',
    );
  } else if (coverage.percent < 80) {
    blockers.push(
      `Cobertura abaixo do mínimo obrigatório: ${coverage.percent.toFixed(2)}% < 80.00%.`,
    );
  }
  if (crap.missingCoverageFiles.length > 0) {
    blockers.push(
      `Evidência CRAP incompleta: cobertura por linha ausente para ${crap.missingCoverageFiles.length} arquivo(s) alterado(s) com código.`,
    );
  }
  if (crap.findings.length > 0) {
    blockers.push(
      `CRAP gate bloqueante: ${crap.findings.length} função(ões) com CRAP > 30 em ${crap.triggerFiles.length} arquivo(s).`,
    );
  }

  const filesSection =
    changedFiles.length > 0
      ? changedFiles.map((f) => `- \`${f}\``).join('\n')
      : '- (nenhum arquivo detectado automaticamente)';

  const blockerSection =
    blockers.length > 0
      ? blockers.map((b) => `- ❌ ${b}`).join('\n')
      : '- ✅ Nenhum bloqueio automático detectado';

  const crapFindingsSection =
    crap.findings.length > 0
      ? crap.findings.map((finding) => `- \`${formatCrapFindingLine(finding)}\``).join('\n')
      : '- ✅ Nenhuma função com CRAP > 30 detectada no escopo alterado';

  const mutationOptionSection =
    evidence.mutation && evidence.mutation.files.length > 0
      ? `### 🧬 Mutation testing (opcional por decisão do usuário)\n` +
        'Mutation testing valida se seus testes realmente detectam regressões comportamentais (não só execução).\n' +
        `- Gatilho detectado: CRAP > 30 em ${evidence.mutation.files.length} arquivo(s)\n` +
        `- Escopo sugerido: \`${evidence.mutation.files.join(', ')}\`\n` +
        `- Estimativa local: **${evidence.mutation.estimatedMinutesMin}–${evidence.mutation.estimatedMinutesMax} min**\n` +
        `- Comando sugerido: \`${evidence.mutation.command ?? 'defina a ferramenta de mutation da sua stack antes de executar'}\`\n\n` +
        '**Caminhos possíveis:**\n' +
        '1. **Continuar sem mutation agora:** seguir o fluxo padrão de revisão/correção.\n' +
        '2. **Aplicar mutation agora:** executar `@speckit /review-auto --mutation` para detalhar e registrar essa trilha.\n\n'
      : '### 🧬 Mutation testing\n- 🔵 Dispensado neste ciclo (nenhum gatilho CRAP > 30 no escopo alterado).\n\n';

  const verdict =
    blockers.length > 0
      ? 'ALTERAÇÕES SOLICITADAS (bloqueios automáticos)'
      : 'REVISÃO GATE 3 EXECUTADA (sem bloqueios automáticos)';

  await recordReviewAutoEvent({
    command: '/review-auto',
    outcome: `✅ ${verdict}`,
    detail:
      `Gate: ${transitionSummary.fromGate} -> ${transitionSummary.toGate}\n` +
      `Status: ${transitionSummary.fromStatus} -> ${transitionSummary.toStatus}\n` +
      `Arquivos detectados: ${changedFiles.length}\n` +
      `Cobertura: ${formatCoverage(coverage)}\n` +
      `CRAP findings: ${crap.findings.length}\n` +
      `Arquivos com gatilho CRAP: ${crap.triggerFiles.length}\n` +
      `Bloqueios: ${blockers.length}`,
    gate: 3,
    commandExecutionId,
    specId: story.metadata.id,
    specTitle: story.metadata.title,
    workspaceRoot: workspaceRootPath,
    fs,
    audit,
    tracer,
  });

  stream.markdown(
    `## ✅ Revisão Orquestrada — STORY-${story.metadata.id}\n\n` +
      `${formatTransitionMarkdown(transitionSummary)}\n\n` +
      `### Evidências coletadas\n` +
      `- Arquivos detectados para revisão: ${changedFiles.length}\n` +
      `- Cobertura detectada: ${formatCoverage(coverage)}\n` +
      `- CRAP avaliado em ${crap.evaluatedFiles} arquivo(s) e ${crap.evaluatedFunctions} função(ões) com CC > 5\n` +
      `- Arquivos com gatilho CRAP > 30: ${crap.triggerFiles.length}\n` +
      `${crap.skippedFiles.length > 0 ? `- Arquivos ignorados na avaliação CRAP (não disponíveis no workspace): ${crap.skippedFiles.length}\n` : ''}\n` +
      `**Arquivos candidatos à revisão**\n` +
      `${filesSection}\n\n` +
      `### CRAP Gate (obrigatório)\n` +
      `${crapFindingsSection}\n\n` +
      `### Guardrails executados (Gate 3)\n` +
      `- Funcionalidade vs critérios de aceite\n` +
      `- Arquitetura e fronteiras\n` +
      `- Qualidade de código e testes\n` +
      `- CRAP por função (CC > 5) com ação determinística (add-tests/refactor)\n` +
      `- Segurança e observabilidade\n` +
      `- NFR e DoD\n\n` +
      `${mutationOptionSection}` +
      `### Bloqueios automáticos\n` +
      `${blockerSection}\n\n` +
      `**Veredito orquestrado:** ${verdict}\n\n` +
      `> Próximo passo obrigatório: no mesmo fluxo do chat, emita o checklist completo do Gate 3 com evidências por item e decisão final (APROVADO ou ALTERAÇÕES SOLICITADAS).\n`,
  );

  stream.markdown('\nEscolha o próximo passo:\n\n');
  emitContextualCommands(
    stream,
    [
      { command: '@speckit /review-auto', description: 'iniciar revisão formal Gate 3' },
      {
        command: '@speckit /review-auto --changes-requested --auto',
        description: 'registrar retrabalho automático',
      },
      {
        command: '@speckit /review-auto --approved --auto',
        description: 'registrar aprovação automática',
      },
      ...(evidence.mutation
        ? [
            {
              command: '@speckit /review-auto --mutation',
              description: 'seguir trilha opcional de mutation testing',
            },
          ]
        : []),
      { command: '@speckit /status', description: 'verificar gate/status após decisão' },
    ],
    'Para intervenção complexa, descreva no chat as evidências do Gate 3 antes de decidir o veredito.',
  );
  emitChatQuickActionButton(stream, '▶ Iniciar Gate 3 (revisão formal)', '@speckit /review-auto');
  emitChatQuickActionButton(
    stream,
    '🔄 Registrar ALTERAÇÕES SOLICITADAS',
    '@speckit /review-auto --changes-requested --auto',
  );
  emitChatQuickActionButton(
    stream,
    '✅ Registrar APROVADO',
    '@speckit /review-auto --approved --auto',
  );
  if (evidence.mutation) {
    emitChatQuickActionButton(
      stream,
      '🧬 Avaliar via Mutation',
      '@speckit /review-auto --mutation',
    );
  }
}
