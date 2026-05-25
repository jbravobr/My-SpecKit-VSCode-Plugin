import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { PLUGIN_VERSION_GRAPH, SCHEMA_VERSION } from './constants';
import { GraphStore } from './GraphStore';
import { ImportExtractor } from './extractors/ExtractorTypes';
import { PerfBudget } from './PerfBudget';
import { Graph, GraphEdge, GraphNode } from './types';

const execFileAsync = promisify(execFile);
const DEFAULT_EXCLUDE_PATTERN =
  '{**/node_modules/**,**/dist/**,**/out/**,**/coverage/**,**/.git/**}';
const SOURCE_INCLUDE_PATTERN = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,java,py,cs}';
const DEFAULT_IGNORED_SEGMENTS = new Set(['node_modules', 'dist', 'out', 'coverage', '.git']);
const PARTIAL_LANGUAGE_ORDER = ['java', 'python', 'csharp'] as const;

type PartialLanguage = (typeof PARTIAL_LANGUAGE_ORDER)[number];

export interface UpdateMetrics {
  touchedFiles: number;
  durationMs: number;
}

export class IncrementalUpdater {
  private readonly touchedPaths = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly store: GraphStore,
    private readonly extractors: ImportExtractor[],
    private readonly debounceMs: number = 500,
    private readonly onMetrics?: (m: UpdateMetrics) => void,
  ) {}

  /** Marca um arquivo como "tocado". Chama flush() após debounce. */
  touch(uri: vscode.Uri | { fsPath: string }): void {
    this.touchedPaths.add(normalizePath(path.resolve(uri.fsPath)));
    this.cancel();
    this.timer = setTimeout(() => {
      void this.flushFromTimer();
    }, this.debounceMs);
  }

  /** Força refresh imediato dos arquivos pendentes. */
  async flush(workspaceRoot: string): Promise<UpdateMetrics> {
    const budgetMs = vscode.workspace
      .getConfiguration('speckit.graph')
      .get<number>('updater.flush.budgetMs', 2000);

    const { result } = await PerfBudget.measure('graph.updater.flush', budgetMs, async () => {
      this.cancel();

      const touchedPaths = [...this.touchedPaths];
      this.touchedPaths.clear();

      return this.flushPaths(workspaceRoot, touchedPaths);
    });

    return result;
  }

  /** Refresh a partir de diff git (prevSha → headSha). */
  async refreshFromGitDiff(
    workspaceRoot: string,
    prevSha: string,
    headSha: string,
  ): Promise<UpdateMetrics> {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--name-only', '--diff-filter=ACDMRT', prevSha, headSha],
      { cwd: workspaceRoot },
    );
    for (const relativePath of stdout
      .split(/\r?\n/)
      .filter((line: string) => line.trim().length > 0)) {
      this.touch({ fsPath: path.join(workspaceRoot, relativePath.trim()) });
    }

    return this.flush(workspaceRoot);
  }

  /** Build completo (do zero) — usado por /init e rebuild. */
  async buildFull(workspaceRoot: string): Promise<Graph> {
    const normalizedWorkspaceRoot = normalizePath(path.resolve(workspaceRoot));
    const uris = await vscode.workspace.findFiles(SOURCE_INCLUDE_PATTERN, DEFAULT_EXCLUDE_PATTERN);
    const graph = await this.createEmptyGraph(workspaceRoot);

    for (const uri of uris) {
      await this.addFileToGraph(
        graph,
        normalizePath(path.resolve(uri.fsPath)),
        normalizedWorkspaceRoot,
        workspaceRoot,
      );
    }

    graph.nodes.sort((left, right) => left.id.localeCompare(right.id));
    graph.edges.sort((left, right) =>
      `${left.from}\0${left.to}`.localeCompare(`${right.from}\0${right.to}`),
    );
    graph.meta.partialLanguages = this.partialLanguagesFor(graph.nodes);

    await this.store.save(workspaceRoot, graph);
    return graph;
  }

  /** Cancela debounce pendente. Útil em dispose. */
  cancel(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private async flushFromTimer(): Promise<void> {
    const groups = this.pendingPathsByWorkspace();
    if (groups.size === 0) {
      return;
    }

    this.touchedPaths.clear();

    for (const [workspaceRoot, paths] of groups) {
      try {
        await this.flushPaths(workspaceRoot, paths);
      } catch (error) {
        for (const filePath of paths) {
          this.touchedPaths.add(filePath);
        }
        console.warn('Unable to refresh graph incrementally:', error);
      }
    }
  }

  private pendingPathsByWorkspace(): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
      return groups;
    }

    for (const filePath of this.touchedPaths) {
      const workspaceRoot = this.workspaceRootForPath(filePath, folders) ?? folders[0]?.uri.fsPath;
      if (workspaceRoot === undefined) {
        continue;
      }

      const paths = groups.get(workspaceRoot) ?? [];
      paths.push(filePath);
      groups.set(workspaceRoot, paths);
    }

    return groups;
  }

  private workspaceRootForPath(
    filePath: string,
    folders: readonly { uri: { fsPath: string } }[],
  ): string | undefined {
    const comparablePath = normalizeForPathCompare(filePath);
    const matchingFolder = folders.find((folder) => {
      const root = normalizeForPathCompare(path.resolve(folder.uri.fsPath));
      return comparablePath === root || comparablePath.startsWith(`${root}/`);
    });

    return matchingFolder?.uri.fsPath;
  }

  private async flushPaths(workspaceRoot: string, touchedPaths: string[]): Promise<UpdateMetrics> {
    const startedAt = Date.now();

    if (touchedPaths.length === 0) {
      return this.emitMetrics({ touchedFiles: 0, durationMs: Date.now() - startedAt });
    }

    const normalizedWorkspaceRoot = normalizePath(path.resolve(workspaceRoot));
    const graph =
      (await this.store.load(workspaceRoot)) ?? (await this.createEmptyGraph(workspaceRoot));

    for (const filePath of touchedPaths) {
      try {
        await this.refreshFile(graph, filePath, normalizedWorkspaceRoot, workspaceRoot);
      } catch (error) {
        this.touchedPaths.add(filePath);
        console.warn(`Unable to refresh graph node for ${filePath}:`, error);
      }
    }

    graph.extractorVersions = this.extractorVersions();
    graph.meta.headSha = await this.readHeadSha(workspaceRoot);
    graph.meta.builtAt = new Date().toISOString();
    graph.meta.partialLanguages = this.partialLanguagesFor(graph.nodes);

    await this.store.save(workspaceRoot, graph);

    return this.emitMetrics({
      touchedFiles: touchedPaths.length,
      durationMs: Date.now() - startedAt,
    });
  }

  private async createEmptyGraph(workspaceRoot: string): Promise<Graph> {
    return {
      schemaVersion: SCHEMA_VERSION,
      pluginVersion: PLUGIN_VERSION_GRAPH,
      extractorVersions: this.extractorVersions(),
      meta: {
        headSha: await this.readHeadSha(workspaceRoot),
        builtAt: new Date().toISOString(),
        perFileHash: {},
        perFileMtime: {},
        partialLanguages: [],
      },
      nodes: [],
      edges: [],
    };
  }

  private async refreshFile(
    graph: Graph,
    filePath: string,
    normalizedWorkspaceRoot: string,
    workspaceRoot: string,
  ): Promise<void> {
    const nodeId = toWorkspaceRelative(filePath, normalizedWorkspaceRoot);

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        this.removeNode(graph, nodeId);
        return;
      }

      await this.addFileToGraph(
        graph,
        filePath,
        normalizedWorkspaceRoot,
        workspaceRoot,
        fileStat.mtimeMs,
      );
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        this.removeNode(graph, nodeId);
        return;
      }

      throw error;
    }
  }

  private async addFileToGraph(
    graph: Graph,
    filePath: string,
    normalizedWorkspaceRoot: string,
    workspaceRoot: string,
    knownMtimeMs?: number,
  ): Promise<void> {
    const nodeId = toWorkspaceRelative(filePath, normalizedWorkspaceRoot);
    const extractor = this.extractorFor(filePath, nodeId);
    if (extractor === undefined) {
      this.removeNode(graph, nodeId);
      return;
    }

    const content = await readFile(filePath, 'utf8');
    const extracted = extractor.extract(filePath, content, workspaceRoot);
    const normalizedNodeId = normalizePath(extracted.nodeId);
    const fileStatMtime = knownMtimeMs ?? (await stat(filePath)).mtimeMs;
    const node: GraphNode = {
      id: normalizedNodeId,
      language: extracted.language,
      symbols: extracted.symbols,
    };
    const edges: GraphEdge[] = extracted.edges.map((edge) => {
      const graphEdge: GraphEdge = {
        from: normalizedNodeId,
        to: normalizePath(edge.to),
        kind: edge.kind,
        confidence: edge.confidence,
        sourceExtractor: extractor.language,
      };

      if (edge.edgeKind !== undefined) {
        graphEdge.edgeKind = edge.edgeKind;
      }

      return graphEdge;
    });

    graph.nodes = [...graph.nodes.filter((existing) => existing.id !== normalizedNodeId), node];
    graph.edges = [
      ...graph.edges.filter((existing) => existing.from !== normalizedNodeId),
      ...edges,
    ];
    graph.meta.perFileHash[normalizedNodeId] = createHash('sha256').update(content).digest('hex');
    graph.meta.perFileMtime[normalizedNodeId] = fileStatMtime;
  }

  private removeNode(graph: Graph, nodeId: string): void {
    graph.nodes = graph.nodes.filter((node) => node.id !== nodeId);
    graph.edges = graph.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
    delete graph.meta.perFileHash[nodeId];
    delete graph.meta.perFileMtime[nodeId];
  }

  private extractorFor(filePath: string, nodeId: string): ImportExtractor | undefined {
    if (isIgnored(nodeId, this.configuredIgnoreGlobs())) {
      return undefined;
    }

    const enabledLanguages = this.enabledLanguages();
    return this.extractors.find(
      (extractor) =>
        enabledLanguages.has(extractor.language) &&
        extractor.supports(filePath) &&
        extractor.supports(nodeId),
    );
  }

  private extractorVersions(): Record<string, string> {
    const enabledLanguages = this.enabledLanguages();
    return Object.fromEntries(
      this.extractors
        .filter((extractor) => enabledLanguages.has(extractor.language))
        .map((extractor) => [extractor.language, extractor.version]),
    );
  }

  private partialLanguagesFor(nodes: GraphNode[]): PartialLanguage[] {
    const languages = new Set(nodes.map((node) => node.language));
    return PARTIAL_LANGUAGE_ORDER.filter((language) => languages.has(language));
  }

  private enabledLanguages(): Set<string> {
    const configured = vscode.workspace
      .getConfiguration('speckit.graph')
      .get<string[]>('languages', ['auto']);
    if (configured === undefined || configured.includes('auto')) {
      return new Set(this.extractors.map((extractor) => extractor.language));
    }

    return new Set(configured);
  }

  private configuredIgnoreGlobs(): string[] {
    return (
      vscode.workspace.getConfiguration('speckit.graph').get<string[]>('ignore', []) ?? []
    ).map(normalizePath);
  }

  private async readHeadSha(workspaceRoot: string): Promise<string> {
    try {
      const gitDir = path.join(workspaceRoot, '.git');
      const head = (await readFile(path.join(gitDir, 'HEAD'), 'utf8')).trim();
      if (!head.startsWith('ref:')) {
        return head;
      }

      const refPath = head.slice('ref:'.length).trim();
      return (await readFile(path.join(gitDir, refPath), 'utf8')).trim();
    } catch {
      return '';
    }
  }

  private emitMetrics(metrics: UpdateMetrics): UpdateMetrics {
    this.onMetrics?.(metrics);
    return metrics;
  }
}

function isIgnored(relativePath: string, additionalGlobs: string[]): boolean {
  const normalized = normalizePath(relativePath);
  const segments = normalized.split('/');
  if (segments.some((segment) => DEFAULT_IGNORED_SEGMENTS.has(segment))) {
    return true;
  }

  return additionalGlobs.some((glob) => globMatches(glob, normalized));
}

function globMatches(pattern: string, value: string): boolean {
  const normalizedPattern = normalizePath(pattern).replace(/^\/+/, '');
  const regex = globToRegExp(normalizedPattern);
  const basenameRegex = globToRegExp(`**/${normalizedPattern}`);
  return regex.test(value) || basenameRegex.test(value);
}

function globToRegExp(pattern: string): RegExp {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else if (char !== undefined) {
      source += escapeRegExp(char);
    }
  }
  source += '$';
  return new RegExp(source);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

function toWorkspaceRelative(filePath: string, normalizedWorkspaceRoot: string): string {
  const normalizedFilePath = normalizePath(path.resolve(filePath));
  return normalizedFilePath === normalizedWorkspaceRoot
    ? path.basename(normalizedFilePath)
    : normalizePath(path.relative(normalizedWorkspaceRoot, normalizedFilePath));
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function normalizeForPathCompare(value: string): string {
  const normalized = normalizePath(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
