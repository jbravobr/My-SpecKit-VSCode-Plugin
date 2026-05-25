import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { GraphStore } from './GraphStore';
import { PerfBudget } from './PerfBudget';

export type GateStatus = 'fresh' | 'stale-async' | 'no-op';

export interface GateResult {
  status: GateStatus;
  warning?: string;
  durationMs: number;
}

export interface GateOptions {
  budgetMs?: number;
  commandName?: string;
}

export type GraphFreshnessOptions = GateOptions;
export type GraphFreshnessResult = GateResult;

const SUPPORTED_CODE_GLOB = '**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs,java,py,cs}';
const EXCLUDE_GLOB = '**/{node_modules,dist,out,coverage}/**';

function shortSha(sha: string | undefined): string {
  if (sha === undefined || sha.length === 0) {
    return 'uncommitted';
  }
  return sha.length > 12 ? sha.slice(0, 12) : sha;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function readTextIfPresent(filePath: string): Promise<string | null> {
  try {
    return (await readFile(filePath, 'utf8')).trim();
  } catch (error: unknown) {
    if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return null;
    }

    throw error;
  }
}

function isSafeGitRef(refPath: string): boolean {
  return refPath.startsWith('refs/') && !refPath.split('/').includes('..');
}

async function readPackedRef(gitDir: string, refPath: string): Promise<string | null> {
  const packedRefs = await readTextIfPresent(path.join(gitDir, 'packed-refs'));
  if (packedRefs === null) {
    return null;
  }

  for (const line of packedRefs.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith('^')) {
      continue;
    }

    const [sha, ref] = trimmed.split(/\s+/, 2);
    if (sha !== undefined && ref === refPath) {
      return sha;
    }
  }

  return null;
}

async function readGitHead(workspaceRoot: string): Promise<string | null> {
  const gitDir = path.join(workspaceRoot, '.git');
  const head = await readTextIfPresent(path.join(gitDir, 'HEAD'));

  if (head === null || head.length === 0) {
    return null;
  }

  if (!head.startsWith('ref:')) {
    return head;
  }

  const refPath = head.slice('ref:'.length).trim();
  if (!isSafeGitRef(refPath)) {
    return null;
  }

  return (
    (await readTextIfPresent(path.join(gitDir, ...refPath.split('/')))) ??
    readPackedRef(gitDir, refPath)
  );
}

function createHeadDriftWarning(oldSha: string | undefined, newSha: string | null): string {
  const headDescription = newSha === null ? 'desconhecido' : shortSha(newSha);
  return `> ⚠️ **GRAPH_STALE_WARNING**: o grafo (.speckit/graph.json) está em SHA ${shortSha(
    oldSha,
  )} mas HEAD está em ${headDescription}. Atualização disparada em background. Sua próxima resposta pode estar baseada em dependências desatualizadas — declare se aplicável.`;
}

function createMissingGraphWarning(): string {
  return '> ⚠️ **GRAPH_STALE_WARNING**: o grafo (.speckit/graph.json) está ausente, mas há código suportado no workspace. Atualização disparada em background. Sua próxima resposta pode estar baseada em dependências desatualizadas — declare se aplicável.';
}

/** Guards participant commands against stale graph context using only cheap synchronous-path reads. */
export class GraphFreshnessGate {
  constructor(
    private readonly store: GraphStore,
    private readonly onStaleAsync?: (reason: string) => void,
  ) {}

  async ensure(workspaceRoot: string, opts?: GateOptions): Promise<GateResult> {
    const config = vscode.workspace.getConfiguration('speckit.graph');
    const enabled = config.get<boolean>('enabled', true);

    if (!enabled) {
      return { status: 'no-op', durationMs: 0 };
    }

    const budgetMs = opts?.budgetMs ?? config.get<number>('gate.budgetMs', 300);
    const { result, check } = await PerfBudget.measure('graph.gate.ensure', budgetMs, () =>
      this.ensureEnabled(workspaceRoot),
    );

    if (check.exceeded && opts?.commandName !== undefined) {
      console.warn(
        `Graph freshness gate exceeded budget for ${opts.commandName}: ${check.measuredMs}ms > ${budgetMs}ms`,
      );
    }

    if (result.status === 'no-op') {
      return result;
    }

    return { ...result, durationMs: check.measuredMs };
  }

  private async ensureEnabled(workspaceRoot: string): Promise<GateResult> {
    const graphExists = await this.store.exists(workspaceRoot);
    if (!graphExists && !(await this.hasSupportedCode())) {
      return { status: 'no-op', durationMs: 0 };
    }

    const meta = await this.store.getMeta(workspaceRoot);

    if (meta === null) {
      this.onStaleAsync?.('missing');
      return {
        status: 'stale-async',
        warning: createMissingGraphWarning(),
        durationMs: 0,
      };
    }

    const currentHead = await readGitHead(workspaceRoot);
    const result: GateResult =
      currentHead !== null && meta.headSha === currentHead
        ? { status: 'fresh', durationMs: 0 }
        : {
            status: 'stale-async',
            warning: createHeadDriftWarning(meta.headSha, currentHead),
            durationMs: 0,
          };

    if (result.status === 'stale-async') {
      this.onStaleAsync?.('headDrift');
    }

    return result;
  }

  private async hasSupportedCode(): Promise<boolean> {
    const files = await vscode.workspace.findFiles(SUPPORTED_CODE_GLOB, EXCLUDE_GLOB, 1);
    return files.length > 0;
  }
}
