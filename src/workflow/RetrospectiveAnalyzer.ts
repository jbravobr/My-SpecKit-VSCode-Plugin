import * as path from 'path';
import type { IFileSystem } from '../generator/utils/IFileSystem';

export interface RetrospectiveDeps {
  workspaceRoot: string;
  fs: IFileSystem;
}

export interface RetrospectiveReport {
  specCount: number;
  avgIterationsPerGate: Record<string, number>;
  topRecurringFindings: Array<{ message: string; count: number; severity: string }>;
  mostRegressedGates: Array<{ gate: number; regressionCount: number }>;
  recommendations: string[];
  isEmpty: boolean;
}

interface IterationSnapshot {
  specId: string;
  perGate: Record<string, number>;
}

interface FindingCandidate {
  message: string;
  severity: string;
}

interface AuditSignal {
  specId?: string;
  gate?: number;
  findings: FindingCandidate[];
}

interface TraceSnapshot {
  specId?: string;
}

interface MetricSnapshot {
  specId?: string;
}

const GATE_LABELS: Record<number, string> = {
  0: 'Backlog',
  1: 'Especificação',
  2: 'Implementação',
  3: 'Validação',
  4: 'Entrega',
};

const RECOMMENDATION_LIMIT = 5;
const FINDING_LIMIT = 5;
const REGRESSION_LIMIT = 5;
const EMPTY_RECOMMENDATION =
  'Nenhum histórico encontrado em `.speckit/`. Rode `/verify`, `/history` e fluxos de gate para gerar dados de retrospectiva.';

export async function analyzeRetrospective(
  deps: RetrospectiveDeps,
): Promise<RetrospectiveReport> {
  const [traceSnapshots, iterationSnapshots, auditSignals, evidenceFindings, metricSnapshots] =
    await Promise.all([
      loadTraceSnapshots(deps),
      loadIterationSnapshots(deps),
      loadAuditSignals(deps),
      loadEvidenceFindings(deps),
      loadMetricSnapshots(deps),
    ]);

  const specIds = new Set<string>();
  for (const trace of traceSnapshots) {
    if (trace.specId) specIds.add(trace.specId);
  }
  for (const snapshot of iterationSnapshots) {
    specIds.add(snapshot.specId);
  }
  for (const signal of auditSignals) {
    if (signal.specId) specIds.add(signal.specId);
  }
  for (const finding of evidenceFindings) {
    if (finding.specId) specIds.add(finding.specId);
  }
  for (const metric of metricSnapshots) {
    if (metric.specId) specIds.add(metric.specId);
  }

  const hasAnyHistoricalData =
    specIds.size > 0 ||
    iterationSnapshots.length > 0 ||
    auditSignals.length > 0 ||
    evidenceFindings.length > 0 ||
    metricSnapshots.length > 0;

  if (!hasAnyHistoricalData) {
    return {
      specCount: 0,
      avgIterationsPerGate: {},
      topRecurringFindings: [],
      mostRegressedGates: [],
      recommendations: [EMPTY_RECOMMENDATION],
      isEmpty: true,
    };
  }

  const denominator = Math.max(specIds.size, iterationSnapshots.length, 1);
  const gateTotals = new Map<number, number>();
  const regressionTotals = new Map<number, number>();

  for (const snapshot of iterationSnapshots) {
    for (const [gateKey, count] of Object.entries(snapshot.perGate)) {
      const gate = Number(gateKey);
      if (!Number.isFinite(gate) || count <= 0) continue;
      gateTotals.set(gate, (gateTotals.get(gate) ?? 0) + count);
      regressionTotals.set(gate, (regressionTotals.get(gate) ?? 0) + count);
    }
  }

  const avgIterationsPerGate = Object.fromEntries(
    [...gateTotals.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([gate, total]) => [formatGateLabel(gate), roundTo(total / denominator)]),
  );

  const allFindings = [
    ...auditSignals.flatMap((signal) => signal.findings),
    ...evidenceFindings.map((finding) => ({
      message: finding.message,
      severity: finding.severity,
    })),
  ];

  const topRecurringFindings = aggregateFindings(allFindings).slice(0, FINDING_LIMIT);
  const mostRegressedGates = [...regressionTotals.entries()]
    .map(([gate, regressionCount]) => ({ gate, regressionCount }))
    .sort((a, b) => b.regressionCount - a.regressionCount || a.gate - b.gate)
    .slice(0, REGRESSION_LIMIT);

  const recommendations = buildRecommendations({
    specCount: specIds.size,
    avgIterationsPerGate,
    topRecurringFindings,
    mostRegressedGates,
  });

  return {
    specCount: specIds.size,
    avgIterationsPerGate,
    topRecurringFindings,
    mostRegressedGates,
    recommendations,
    isEmpty: false,
  };
}

async function loadTraceSnapshots(deps: RetrospectiveDeps): Promise<TraceSnapshot[]> {
  const traceDir = joinWorkspacePath(deps.workspaceRoot, '.speckit', 'traceability');
  const fileNames = await listDirSafe(deps.fs, traceDir);
  const traces: TraceSnapshot[] = [];

  for (const fileName of fileNames.filter((name) => name.endsWith('.json'))) {
    const filePath = path.posix.join(traceDir, fileName);
    const raw = await readFileSafe(deps.fs, filePath);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as { specId?: unknown };
      const specId = typeof parsed.specId === 'string' ? parsed.specId.trim() : '';
      if (specId) traces.push({ specId });
    } catch {
      // Ignore malformed trace snapshots
    }
  }

  return traces;
}

async function loadIterationSnapshots(deps: RetrospectiveDeps): Promise<IterationSnapshot[]> {
  const countersDir = joinWorkspacePath(deps.workspaceRoot, '.speckit', 'state', 'iteration-counters');
  const fileNames = await listDirSafe(deps.fs, countersDir);
  const snapshots: IterationSnapshot[] = [];

  for (const fileName of fileNames.filter((name) => name.endsWith('.json'))) {
    const filePath = path.posix.join(countersDir, fileName);
    const raw = await readFileSafe(deps.fs, filePath);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as { perGate?: Record<string, unknown> };
      const perGateEntries = Object.entries(parsed.perGate ?? {}).filter(
        ([, value]) => typeof value === 'number' && Number.isFinite(value),
      );
      const perGate = Object.fromEntries(perGateEntries) as Record<string, number>;
      snapshots.push({
        specId: fileName.replace(/\.json$/i, ''),
        perGate,
      });
    } catch {
      snapshots.push({ specId: fileName.replace(/\.json$/i, ''), perGate: {} });
    }
  }

  return snapshots;
}

async function loadAuditSignals(deps: RetrospectiveDeps): Promise<AuditSignal[]> {
  const signals: AuditSignal[] = [];
  const auditDir = joinWorkspacePath(deps.workspaceRoot, '.speckit', 'audit');
  const auditFiles = await listDirSafe(deps.fs, auditDir);

  for (const fileName of auditFiles) {
    const filePath = path.posix.join(auditDir, fileName);
    const raw = await readFileSafe(deps.fs, filePath);
    if (!raw) continue;
    signals.push(...parseAuditContent(raw, fileName.replace(/\.[^.]+$/g, '')));
  }

  const legacyAuditPath = joinWorkspacePath(deps.workspaceRoot, '.speckit', 'audit.log');
  const legacyAudit = await readFileSafe(deps.fs, legacyAuditPath);
  if (legacyAudit) {
    signals.push(...parseLegacyAuditLog(legacyAudit));
  }

  return signals;
}

async function loadEvidenceFindings(
  deps: RetrospectiveDeps,
): Promise<Array<{ specId?: string; message: string; severity: string }>> {
  const evidenceDir = joinWorkspacePath(deps.workspaceRoot, '.speckit', 'evidence');
  const fileNames = await listDirSafe(deps.fs, evidenceDir);
  const findings: Array<{ specId?: string; message: string; severity: string }> = [];

  for (const fileName of fileNames.filter((name) => name.endsWith('.json'))) {
    const filePath = path.posix.join(evidenceDir, fileName);
    const raw = await readFileSafe(deps.fs, filePath);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as {
        specId?: unknown;
        findings?: Array<{ message?: unknown; severity?: unknown }>;
      };
      const specId = typeof parsed.specId === 'string' ? parsed.specId : undefined;
      for (const finding of parsed.findings ?? []) {
        if (typeof finding.message !== 'string' || finding.message.trim().length === 0) continue;
        findings.push({
          specId,
          message: finding.message.trim(),
          severity: normalizeSeverity(finding.severity),
        });
      }
    } catch {
      // Ignore malformed evidence payloads
    }
  }

  return findings;
}

async function loadMetricSnapshots(deps: RetrospectiveDeps): Promise<MetricSnapshot[]> {
  const metricsPath = joinWorkspacePath(deps.workspaceRoot, '.speckit', 'metrics', 'events.jsonl');
  const raw = await readFileSafe(deps.fs, metricsPath);
  if (!raw) return [];

  const snapshots: MetricSnapshot[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed) as { specId?: unknown };
      if (typeof parsed.specId === 'string' && parsed.specId.trim().length > 0) {
        snapshots.push({ specId: parsed.specId.trim() });
      }
    } catch {
      // Ignore malformed metric lines
    }
  }

  return snapshots;
}

function parseAuditContent(content: string, fallbackSpecId?: string): AuditSignal[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const parsedJson = tryParseJson(trimmed);
  if (parsedJson !== undefined) {
    return flattenStructuredAudit(parsedJson, fallbackSpecId);
  }

  const jsonlSignals: AuditSignal[] = [];
  let parsedSomeJsonLine = false;
  for (const line of trimmed.split(/\r?\n/)) {
    const candidate = line.trim();
    if (!candidate) continue;
    const parsedLine = tryParseJson(candidate);
    if (parsedLine === undefined) continue;
    parsedSomeJsonLine = true;
    jsonlSignals.push(...flattenStructuredAudit(parsedLine, fallbackSpecId));
  }

  if (parsedSomeJsonLine) {
    return jsonlSignals;
  }

  return parseLegacyAuditLog(trimmed, fallbackSpecId);
}

function flattenStructuredAudit(input: unknown, fallbackSpecId?: string): AuditSignal[] {
  if (Array.isArray(input)) {
    return input.flatMap((item) => flattenStructuredAudit(item, fallbackSpecId));
  }

  if (!isRecord(input)) {
    return [];
  }

  const localSpecId = firstString(
    input.specId,
    input.spec,
    isRecord(input.context) ? input.context.specId : undefined,
    fallbackSpecId,
  );
  const localGate = parseGateValue(
    input.gate,
    isRecord(input.context) ? input.context.gate : undefined,
    input.toGate,
    input.fromGate,
  );
  const localFindings = extractFindingCandidates(input);
  const localDetail = firstString(input.detail, input.message, input.summary, input.description);

  const nestedCollections = ['entries', 'events', 'records', 'items'].flatMap((key) => {
    const value = input[key];
    return Array.isArray(value) ? value : [];
  });

  const nestedSignals = nestedCollections.flatMap((entry) => flattenStructuredAudit(entry, localSpecId));
  const hasLocalSignal = Boolean(localSpecId || localGate !== undefined || localFindings.length > 0 || localDetail);

  const currentSignal: AuditSignal[] = hasLocalSignal
    ? [
        {
          specId: localSpecId,
          gate: localGate,
          findings: localFindings,
        },
      ]
    : [];

  return [...currentSignal, ...nestedSignals];
}

function extractFindingCandidates(record: Record<string, unknown>): FindingCandidate[] {
  const findings: FindingCandidate[] = [];

  const pushCandidate = (message: unknown, severity: unknown): void => {
    if (typeof message !== 'string' || message.trim().length === 0) return;
    findings.push({ message: message.trim(), severity: normalizeSeverity(severity) });
  };

  pushCandidate(record.message, record.severity);
  if (record.event === 'error' || record.event === 'warning') {
    pushCandidate(record.detail, record.event);
  }

  if (Array.isArray(record.findings)) {
    for (const finding of record.findings) {
      if (!isRecord(finding)) continue;
      pushCandidate(finding.message, finding.severity);
    }
  }

  return findings;
}

function parseLegacyAuditLog(content: string, fallbackSpecId?: string): AuditSignal[] {
  const signals: AuditSignal[] = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^\[(.+?)\]\s+([^:]+):\s*(.*)$/);
    const detail = match ? match[3].trim() : trimmed;
    const { cleanDetail, context } = splitAuditDetail(detail);
    const gate = parseGateValue(context.gate, cleanDetail);
    const specId = firstString(context.specId, fallbackSpecId);
    const findings = inferFindingsFromText(cleanDetail, match?.[2]);

    signals.push({ specId, gate, findings });
  }

  return signals;
}

function inferFindingsFromText(detail: string, eventType?: string): FindingCandidate[] {
  const normalizedDetail = detail.trim();
  if (normalizedDetail.length === 0) return [];
  if (!/(erro|error|warn|warning|block|falha|failed|timeout|coverage|cobertura|typecheck|tsc|teste|test)/i.test(normalizedDetail)) {
    return [];
  }

  return [
    {
      message: normalizedDetail,
      severity: normalizeSeverity(eventType),
    },
  ];
}

function aggregateFindings(
  findings: FindingCandidate[],
): Array<{ message: string; count: number; severity: string }> {
  const grouped = new Map<
    string,
    {
      count: number;
      messageCounts: Map<string, number>;
      severity: string;
    }
  >();

  for (const finding of findings) {
    if (!finding.message.trim()) continue;
    const normalized = normalizeFindingMessage(finding.message);
    const existing = grouped.get(normalized) ?? {
      count: 0,
      messageCounts: new Map<string, number>(),
      severity: 'info',
    };
    existing.count += 1;
    existing.messageCounts.set(finding.message, (existing.messageCounts.get(finding.message) ?? 0) + 1);
    if (severityRank(finding.severity) < severityRank(existing.severity)) {
      existing.severity = normalizeSeverity(finding.severity);
    }
    grouped.set(normalized, existing);
  }

  return [...grouped.values()]
    .map((group) => ({
      message: pickRepresentativeMessage(group.messageCounts),
      count: group.count,
      severity: group.severity,
    }))
    .sort((a, b) => b.count - a.count || severityRank(a.severity) - severityRank(b.severity));
}

function pickRepresentativeMessage(messages: Map<string, number>): string {
  return [...messages.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .map(([message]) => message)[0] ?? 'Achado recorrente';
}

function normalizeFindingMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/`[^`]+`/g, '<code>')
    .replace(/"[^"]+"/g, '<value>')
    .replace(/'[^']+'/g, '<value>')
    .replace(/[a-z]:\\[^\s]+/gi, '<path>')
    .replace(/\b[a-z0-9_.-]+\.(ts|tsx|js|jsx|json|md|yml|yaml|py|java|cs)\b/gi, '<file>')
    .replace(/\b\d+(?:[.,]\d+)?%?\b/g, '<n>')
    .replace(/\bstory[-_ ]?[a-z0-9]+\b/gi, '<spec>')
    .replace(/\bfix[-_ ]?[a-z0-9]+\b/gi, '<spec>')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildRecommendations(input: {
  specCount: number;
  avgIterationsPerGate: Record<string, number>;
  topRecurringFindings: Array<{ message: string; count: number; severity: string }>;
  mostRegressedGates: Array<{ gate: number; regressionCount: number }>;
}): string[] {
  const recommendations: string[] = [];

  for (const [gateLabel, average] of Object.entries(input.avgIterationsPerGate)) {
    if (average >= 3) {
      recommendations.push(
        `${gateLabel} está com média de ${average.toFixed(2)} iterações — considere reforçar checklist, evidências e testes antes de avançar.`,
      );
    }
  }

  const topGate = input.mostRegressedGates[0];
  if (topGate && topGate.regressionCount > 0) {
    recommendations.push(
      `${formatGateLabel(topGate.gate)} concentrou ${topGate.regressionCount} regressão(ões) — revise critérios de saída desse gate e valide o pacote completo antes de reabrir.`,
    );
  }

  const topFinding = input.topRecurringFindings[0];
  if (topFinding && topFinding.count >= 2) {
    recommendations.push(
      `O achado recorrente "${topFinding.message}" apareceu ${topFinding.count} vezes — transforme isso em guardrail/checklist permanente do time.`,
    );
    if (/(coverage|cobertura|teste|test)/i.test(topFinding.message)) {
      recommendations.push(
        'Cobertura/testes aparecem como padrão recorrente — use `/verify` cedo e reforce critérios rastreáveis antes do Gate 3.',
      );
    }
    if (/(typecheck|tsc|tipo|typescript)/i.test(topFinding.message)) {
      recommendations.push(
        'Type-check recorrente — rode `npx tsc --noEmit` antes de pedir revisão para reduzir retrabalho em Gate 2/3.',
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(
      `Histórico consolidado de ${input.specCount} spec(s) sem hotspots claros — mantenha \`/verify\`, \`/metrics\` e \`/history\` como rotina de melhoria contínua.`,
    );
  }

  return dedupe(recommendations).slice(0, RECOMMENDATION_LIMIT);
}

function splitAuditDetail(detail: string): {
  cleanDetail: string;
  context: Record<string, string>;
} {
  const separatorIndex = detail.indexOf(' | ');
  if (separatorIndex === -1) return { cleanDetail: detail, context: {} };

  const cleanDetail = detail.slice(0, separatorIndex).trim();
  const contextRaw = detail.slice(separatorIndex + 3).trim();
  const context: Record<string, string> = {};
  const pattern = /(\w+)="((?:\\"|[^"])*)"/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(contextRaw))) {
    context[match[1]] = match[2].replace(/\\"/g, '"');
  }

  return { cleanDetail, context };
}

function parseGateValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value !== 'string') continue;

    const direct = Number(value);
    if (Number.isFinite(direct)) return direct;

    const match = value.match(/gate\s*(\d+)/i);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return undefined;
}

function normalizeSeverity(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  switch (normalized) {
    case 'blocker':
      return 'blocker';
    case 'error':
    case 'erro':
    case 'failed':
      return 'error';
    case 'warn':
    case 'warning':
    case 'aviso':
      return 'warn';
    default:
      return 'info';
  }
}

function severityRank(severity: string): number {
  switch (normalizeSeverity(severity)) {
    case 'blocker':
      return 0;
    case 'error':
      return 1;
    case 'warn':
      return 2;
    default:
      return 3;
  }
}

function formatGateLabel(gate: number): string {
  return gate in GATE_LABELS ? `Gate ${gate} — ${GATE_LABELS[gate]}` : `Gate ${gate}`;
}

function roundTo(value: number): number {
  return Math.round(value * 100) / 100;
}

function joinWorkspacePath(workspaceRoot: string, ...segments: string[]): string {
  return path.posix.join(workspaceRoot.replace(/\\/g, '/'), ...segments);
}

async function listDirSafe(fs: IFileSystem, dirPath: string): Promise<string[]> {
  try {
    return await fs.listDir(dirPath);
  } catch {
    return [];
  }
}

async function readFileSafe(fs: IFileSystem, filePath: string): Promise<string | undefined> {
  try {
    if (!(await fs.fileExists(filePath))) return undefined;
    return await fs.readFile(filePath);
  } catch {
    return undefined;
  }
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
