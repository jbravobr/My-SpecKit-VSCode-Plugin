import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface GraphInspectionEvidence {
  timestamp: string;
  storyId?: string;
  consultedEntities: Array<{ nodeId: string; reason: string }>;
  veto?: 'VETO_GRAPH_NOT_AVAILABLE';
  headSha?: string;
}

export interface RefactorEvidenceValidationOptions {
  compareHead?: boolean;
  currentHeadSha?: string | null;
}

export type RefactorEvidenceValidationResult =
  | { ok: true; reason?: 'vetoed' }
  | { ok: false; reason: 'missing' | 'empty' | 'stale' };

const EVIDENCE_PATH = ['.speckit', 'evidence', 'graph-inspection.json'];

export async function writeEvidence(
  workspaceRoot: string,
  evidence: GraphInspectionEvidence,
): Promise<void> {
  const evidencePath = getEvidencePath(workspaceRoot);
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(
    evidencePath,
    `${JSON.stringify(normalizeEvidence(evidence), null, 2)}\n`,
    'utf8',
  );
}

export async function readEvidence(workspaceRoot: string): Promise<GraphInspectionEvidence | null> {
  try {
    const content = await readFile(getEvidencePath(workspaceRoot), 'utf8');
    const parsed: unknown = JSON.parse(content) as unknown;
    return isGraphInspectionEvidence(parsed) ? normalizeEvidence(parsed) : null;
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function validateRefactorEvidence(
  workspaceRoot: string,
  opts: RefactorEvidenceValidationOptions = {},
): Promise<RefactorEvidenceValidationResult> {
  const evidence = await readEvidence(workspaceRoot);
  if (evidence === null) return { ok: false, reason: 'missing' };

  if (opts.compareHead === true || opts.currentHeadSha !== undefined) {
    const currentHead = opts.currentHeadSha ?? (await readCurrentHeadSha(workspaceRoot));
    if (evidence.headSha && currentHead && evidence.headSha !== currentHead) {
      return { ok: false, reason: 'stale' };
    }
  }

  if (evidence.veto === 'VETO_GRAPH_NOT_AVAILABLE') return { ok: true, reason: 'vetoed' };
  if (evidence.consultedEntities.length >= 1) return { ok: true };
  return { ok: false, reason: 'empty' };
}

export async function readCurrentHeadSha(workspaceRoot: string): Promise<string | null> {
  const gitDir = path.join(workspaceRoot, '.git');
  const head = await readTextIfPresent(path.join(gitDir, 'HEAD'));

  if (head === null || head.length === 0) return null;
  if (!head.startsWith('ref:')) return head;

  const refPath = head.slice('ref:'.length).trim();
  if (!isSafeGitRef(refPath)) return null;

  return (
    (await readTextIfPresent(path.join(gitDir, ...refPath.split('/')))) ??
    readPackedRef(gitDir, refPath)
  );
}

function getEvidencePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ...EVIDENCE_PATH);
}

function normalizeEvidence(evidence: GraphInspectionEvidence): GraphInspectionEvidence {
  return {
    ...evidence,
    consultedEntities: evidence.consultedEntities.map((entity) => ({
      nodeId: normalizeSlashPath(entity.nodeId),
      reason: entity.reason,
    })),
  };
}

function normalizeSlashPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function isGraphInspectionEvidence(value: unknown): value is GraphInspectionEvidence {
  if (!isRecord(value)) return false;
  return (
    typeof value.timestamp === 'string' &&
    Array.isArray(value.consultedEntities) &&
    value.consultedEntities.every(isConsultedEntity) &&
    (value.storyId === undefined || typeof value.storyId === 'string') &&
    (value.veto === undefined || value.veto === 'VETO_GRAPH_NOT_AVAILABLE') &&
    (value.headSha === undefined || typeof value.headSha === 'string')
  );
}

function isConsultedEntity(value: unknown): value is { nodeId: string; reason: string } {
  return isRecord(value) && typeof value.nodeId === 'string' && typeof value.reason === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function readTextIfPresent(filePath: string): Promise<string | null> {
  try {
    return (await readFile(filePath, 'utf8')).trim();
  } catch (error: unknown) {
    if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return null;
    throw error;
  }
}

function isSafeGitRef(refPath: string): boolean {
  return refPath.startsWith('refs/') && !refPath.split('/').includes('..');
}

async function readPackedRef(gitDir: string, refPath: string): Promise<string | null> {
  const packedRefs = await readTextIfPresent(path.join(gitDir, 'packed-refs'));
  if (packedRefs === null) return null;

  for (const line of packedRefs.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith('^')) continue;

    const [sha, ref] = trimmed.split(/\s+/, 2);
    if (sha !== undefined && ref === refPath) return sha;
  }

  return null;
}
