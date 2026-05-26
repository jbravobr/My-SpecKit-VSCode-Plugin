import * as path from 'path';

import type { IFileSystem } from '../generator/utils/IFileSystem';

export interface RecordDecisionDeps {
  workspaceRoot: string;
  fs: IFileSystem;
  decision: DecisionInput;
}

export interface DecisionInput {
  kind: 'alternative-discarded' | 'gate-regression' | 'mode-switch' | 'breaking-change';
  specId: string;
  context: string;
  decision: string;
  alternatives?: string[];
  consequences?: string;
}

const decisionQueues = new Map<string, Promise<void>>();

export function recordDecision(deps: RecordDecisionDeps): Promise<string | undefined> {
  const decisionsDir = path.join(deps.workspaceRoot, '.speckit', 'decisions');
  const previous = decisionQueues.get(decisionsDir) ?? Promise.resolve();
  const current = previous.then(() => doRecordDecision(deps, decisionsDir));
  const queued = current.then(
    () => undefined,
    () => undefined,
  );

  decisionQueues.set(decisionsDir, queued);
  void queued.finally(() => {
    if (decisionQueues.get(decisionsDir) === queued) {
      decisionQueues.delete(decisionsDir);
    }
  });

  return current;
}

async function doRecordDecision(
  deps: RecordDecisionDeps,
  decisionsDir: string,
): Promise<string | undefined> {
  const decision = sanitizeDecision(deps.decision);
  if (!decision) return undefined;

  await deps.fs.ensureDir(decisionsDir);

  const number = await nextAdrNumber(decisionsDir, deps.fs);
  const paddedNumber = String(number).padStart(4, '0');
  const title = inferTitle(decision.decision);
  const slug = toSlug(title);
  const fileName = `ADR-${paddedNumber}-${slug}.md`;
  const filePath = path.join(decisionsDir, fileName);
  const content = renderAdr(paddedNumber, title, decision);

  await deps.fs.writeFile(filePath, content);
  return filePath;
}

async function nextAdrNumber(decisionsDir: string, fs: IFileSystem): Promise<number> {
  const entries = await fs.listDir(decisionsDir).catch(() => [] as string[]);
  let maxNumber = 0;

  for (const entry of entries) {
    const match = /^ADR-(\d{4,})/i.exec(entry);
    if (!match) continue;

    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) {
      maxNumber = Math.max(maxNumber, parsed);
    }
  }

  return maxNumber + 1;
}

function sanitizeDecision(input: DecisionInput): DecisionInput | undefined {
  const specId = normalizeInline(input.specId);
  const context = normalizeInline(input.context);
  const decision = normalizeInline(input.decision);
  if (!specId || !context || !decision) return undefined;

  const alternatives = input.alternatives
    ?.map((item) => normalizeInline(item))
    .filter((item): item is string => item.length > 0);
  const consequences = normalizeInline(input.consequences);

  return {
    ...input,
    specId,
    context,
    decision,
    alternatives,
    consequences: consequences || undefined,
  };
}

function renderAdr(number: string, title: string, decision: DecisionInput): string {
  return [
    `# ADR-${number}: ${title}`,
    '',
    '- **Status:** accepted',
    `- **Date:** ${new Date().toISOString().slice(0, 10)}`,
    `- **Spec:** ${decision.specId}`,
    `- **Context:** ${decision.context}`,
    `- **Decision:** ${decision.decision}`,
    `- **Alternatives considered:** ${formatAlternatives(decision.alternatives)}`,
    `- **Consequences:** ${decision.consequences ?? 'none recorded'}`,
    '',
  ].join('\n');
}

function inferTitle(decision: string): string {
  const firstSentence = decision.split(/[.!?]/)[0]?.trim() ?? decision;
  const trimmed = firstSentence.slice(0, 80).trim();
  return capitalize(trimmed || 'Recorded decision');
}

function formatAlternatives(alternatives: string[] | undefined): string {
  if (!alternatives || alternatives.length === 0) return 'none recorded';
  return alternatives.join('; ');
}

function toSlug(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');

  return slug || 'decision';
}

function normalizeInline(value: string | undefined): string {
  return (value ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
