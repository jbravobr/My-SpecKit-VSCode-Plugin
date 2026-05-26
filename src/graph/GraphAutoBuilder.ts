import path from 'node:path';
import type { IFileSystem } from '../generator/utils/IFileSystem';
import { GraphBuilder } from './GraphBuilder';
import { PerfBudget } from './PerfBudget';
import { GraphStore } from './GraphStore';
import type { Graph } from './types';

const DEFAULT_BUDGET_MS = 2_000;
const GRAPH_FILE_PATH = '.speckit/graph.json';

/** Outcome of silently ensuring graph availability for a workspace. */
export interface EnsureGraphResult {
  built: boolean;
  fresh: boolean;
  error?: string;
}

interface GraphBuilderLike {
  build(workspaceFolder: string): Promise<Graph>;
}

interface GraphAutoBuilderOptions {
  builder?: GraphBuilderLike;
  store?: GraphStore;
  budgetMs?: number;
  now?: () => string;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isSafeGitRef(refPath: string): boolean {
  return refPath.startsWith('refs/') && !refPath.split('/').includes('..');
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return String(error);
}

async function readTextIfPresent(fs: IFileSystem, filePath: string): Promise<string | null> {
  if (!(await fs.fileExists(filePath))) {
    return null;
  }

  return (await fs.readFile(filePath)).trim();
}

async function readPackedRef(
  fs: IFileSystem,
  gitDir: string,
  refPath: string,
): Promise<string | null> {
  const packedRefs = await readTextIfPresent(fs, path.join(gitDir, 'packed-refs'));
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

async function readCurrentHeadSha(workspaceRoot: string, fs: IFileSystem): Promise<string | null> {
  const gitDir = path.join(workspaceRoot, '.git');

  try {
    const head = await readTextIfPresent(fs, path.join(gitDir, 'HEAD'));
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
      (await readTextIfPresent(fs, path.join(gitDir, ...refPath.split('/')))) ??
      readPackedRef(fs, gitDir, refPath)
    );
  } catch (error: unknown) {
    if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return null;
    }

    throw error;
  }
}

function isFresh(graph: Graph, currentHeadSha: string | null): boolean {
  // Non-git workspaces cannot prove drift, so an existing graph is treated as fresh enough.
  return currentHeadSha === null || graph.meta.headSha === currentHeadSha;
}

function withPersistedMeta(graph: Graph, currentHeadSha: string | null, builtAt: string): Graph {
  return {
    ...graph,
    meta: {
      ...graph.meta,
      builtAt,
      ...(currentHeadSha === null ? {} : { headSha: currentHeadSha }),
    },
  };
}

/** Silently ensures the workspace graph exists on disk and is fresh enough for runtime use. */
export class GraphAutoBuilder {
  private readonly builder: GraphBuilderLike;
  private readonly store: GraphStore;
  private readonly budgetMs: number;
  private readonly now: () => string;

  constructor(
    private readonly fs: IFileSystem,
    options: GraphAutoBuilderOptions = {},
  ) {
    this.builder = options.builder ?? new GraphBuilder();
    this.store = options.store ?? new GraphStore(GRAPH_FILE_PATH, fs);
    this.budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Builds and persists the graph when it is missing or stale, returning graceful status instead of throwing. */
  async ensureGraphExists(workspaceRoot: string): Promise<EnsureGraphResult> {
    try {
      const { result } = await PerfBudget.measure('graph.autoBuilder.ensure', this.budgetMs, () =>
        this.ensureGraphExistsInternal(workspaceRoot),
      );
      return result;
    } catch (error: unknown) {
      return { built: false, fresh: false, error: toErrorMessage(error) };
    }
  }

  private async ensureGraphExistsInternal(workspaceRoot: string): Promise<EnsureGraphResult> {
    const currentHeadSha = await readCurrentHeadSha(workspaceRoot, this.fs);
    const graph = await this.store.load(workspaceRoot);

    if (graph !== null && isFresh(graph, currentHeadSha)) {
      return { built: false, fresh: true };
    }

    try {
      const builtGraph = await this.builder.build(workspaceRoot);
      await this.store.save(
        workspaceRoot,
        withPersistedMeta(builtGraph, currentHeadSha, this.now()),
      );
      return { built: true, fresh: true };
    } catch (error: unknown) {
      return { built: false, fresh: false, error: toErrorMessage(error) };
    }
  }
}

/** Public helper for silently guaranteeing graph availability without leaking build failures. */
export async function ensureGraphExists(
  workspaceRoot: string,
  fs: IFileSystem,
): Promise<EnsureGraphResult> {
  return new GraphAutoBuilder(fs).ensureGraphExists(workspaceRoot);
}
