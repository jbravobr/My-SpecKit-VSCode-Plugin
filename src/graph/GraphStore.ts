import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IFileSystem } from '../generator/utils/IFileSystem';
import { PLUGIN_VERSION_GRAPH, SCHEMA_VERSION } from './constants';
import type { Graph, GraphMeta } from './types';

function normalizeGraphPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'number');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function getMajor(version: string): string {
  return version.split('.')[0] ?? '';
}

function normalizeRecordKeys<T>(value: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [normalizeGraphPath(key), item]),
  );
}

function normalizeGraph(graph: Graph): Graph {
  return {
    ...graph,
    meta: {
      ...graph.meta,
      perFileHash: normalizeRecordKeys(graph.meta.perFileHash),
      perFileMtime: normalizeRecordKeys(graph.meta.perFileMtime),
    },
    nodes: graph.nodes.map((node) => ({ ...node, id: normalizeGraphPath(node.id) })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      from: normalizeGraphPath(edge.from),
      to: normalizeGraphPath(edge.to),
    })),
  };
}

/** Persists and loads the versioned graph document from disk. */
export class GraphStore {
  constructor(
    private readonly relativeFilePath: string = '.speckit/graph.json',
    private readonly fs?: Pick<IFileSystem, 'ensureDir' | 'writeFile' | 'readFile' | 'fileExists'>,
  ) {}

  /** Loads and validates the graph JSON for a workspace, returning null when absent or invalid. */
  async load(workspaceRoot: string): Promise<Graph | null> {
    if (!(await this.exists(workspaceRoot))) {
      return null;
    }

    try {
      const contents = await this.readGraphFile(this.getFilePath(workspaceRoot));
      const parsed: unknown = JSON.parse(contents) as unknown;
      const validation = this.validate(parsed);

      if (!validation.ok) {
        console.warn(`Invalid graph file: ${validation.reason}`);
        return null;
      }

      return validation.graph;
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return null;
      }

      console.warn('Unable to load graph file:', error);
      return null;
    }
  }

  /** Saves a graph JSON file, creating the target directory and normalizing graph paths to slash separators. */
  async save(workspaceRoot: string, graph: Graph): Promise<void> {
    const filePath = this.getFilePath(workspaceRoot);
    await this.writeGraphFile(filePath, `${JSON.stringify(normalizeGraph(graph), null, 2)}\n`);
  }

  /** Loads only the graph metadata for a workspace, returning null when no valid graph exists. */
  async getMeta(workspaceRoot: string): Promise<GraphMeta | null> {
    const graph = await this.load(workspaceRoot);
    return graph?.meta ?? null;
  }

  /** Checks whether the graph JSON file exists for a workspace. */
  async exists(workspaceRoot: string): Promise<boolean> {
    try {
      if (this.fs !== undefined) {
        return await this.fs.fileExists(this.getFilePath(workspaceRoot));
      }

      await access(this.getFilePath(workspaceRoot));
      return true;
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return false;
      }

      return false;
    }
  }

  /** Validates graph shape and schema/plugin major-version compatibility. */
  validate(graph: unknown): { ok: true; graph: Graph } | { ok: false; reason: string } {
    if (!isRecord(graph)) {
      return { ok: false, reason: 'schema mismatch: top-level graph must be an object' };
    }

    const requiredFields = [
      'schemaVersion',
      'pluginVersion',
      'extractorVersions',
      'meta',
      'nodes',
      'edges',
    ];
    for (const field of requiredFields) {
      if (!(field in graph)) {
        return { ok: false, reason: `schema mismatch: missing ${field}` };
      }
    }

    if (typeof graph.schemaVersion !== 'string') {
      return { ok: false, reason: 'schema mismatch: schemaVersion must be a string' };
    }

    if (getMajor(graph.schemaVersion) !== getMajor(SCHEMA_VERSION)) {
      return {
        ok: false,
        reason: `schema mismatch: unsupported schemaVersion ${graph.schemaVersion}`,
      };
    }

    if (typeof graph.pluginVersion !== 'string') {
      return { ok: false, reason: 'schema mismatch: pluginVersion must be a string' };
    }

    if (getMajor(graph.pluginVersion) !== getMajor(PLUGIN_VERSION_GRAPH)) {
      return {
        ok: false,
        reason: `schema mismatch: unsupported pluginVersion ${graph.pluginVersion}`,
      };
    }

    if (!isStringRecord(graph.extractorVersions)) {
      return { ok: false, reason: 'schema mismatch: extractorVersions must be a string map' };
    }

    if (!this.isGraphMeta(graph.meta)) {
      return { ok: false, reason: 'schema mismatch: meta is invalid' };
    }

    if (!Array.isArray(graph.nodes)) {
      return { ok: false, reason: 'schema mismatch: nodes must be an array' };
    }

    if (!Array.isArray(graph.edges)) {
      return { ok: false, reason: 'schema mismatch: edges must be an array' };
    }

    if (!graph.nodes.every((node) => this.isGraphNode(node))) {
      return { ok: false, reason: 'schema mismatch: nodes contain invalid entries' };
    }

    if (!graph.edges.every((edge) => this.isGraphEdge(edge))) {
      return { ok: false, reason: 'schema mismatch: edges contain invalid entries' };
    }

    return {
      ok: true,
      graph: {
        schemaVersion: graph.schemaVersion,
        pluginVersion: graph.pluginVersion,
        extractorVersions: graph.extractorVersions,
        meta: graph.meta,
        nodes: graph.nodes as Graph['nodes'],
        edges: graph.edges as Graph['edges'],
      },
    };
  }

  private getFilePath(workspaceRoot: string): string {
    return path.join(workspaceRoot, this.relativeFilePath);
  }

  private async readGraphFile(filePath: string): Promise<string> {
    if (this.fs !== undefined) {
      return this.fs.readFile(filePath);
    }

    return readFile(filePath, 'utf8');
  }

  private async writeGraphFile(filePath: string, content: string): Promise<void> {
    if (this.fs !== undefined) {
      await this.fs.ensureDir(path.dirname(filePath));
      await this.fs.writeFile(filePath, content);
      return;
    }

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }

  private isGraphNode(node: unknown): node is Graph['nodes'][number] {
    return (
      isRecord(node) &&
      typeof node.id === 'string' &&
      typeof node.language === 'string' &&
      Array.isArray(node.symbols) &&
      node.symbols.every((symbol) => typeof symbol === 'string')
    );
  }

  private isGraphEdge(edge: unknown): edge is Graph['edges'][number] {
    return (
      isRecord(edge) &&
      typeof edge.from === 'string' &&
      typeof edge.to === 'string' &&
      (edge.kind === 'IMPORTS' || edge.kind === 'INHERITS' || edge.kind === 'INSTANTIATES') &&
      (edge.confidence === 'EXTRACTED' ||
        edge.confidence === 'INFERRED' ||
        edge.confidence === 'AMBIGUOUS') &&
      typeof edge.sourceExtractor === 'string' &&
      (edge.edgeKind === undefined || typeof edge.edgeKind === 'string')
    );
  }

  private isGraphMeta(meta: unknown): meta is GraphMeta {
    return (
      isRecord(meta) &&
      (meta.headSha === undefined || typeof meta.headSha === 'string') &&
      (meta.lastGateSha === undefined || typeof meta.lastGateSha === 'string') &&
      typeof meta.builtAt === 'string' &&
      isStringRecord(meta.perFileHash) &&
      isNumberRecord(meta.perFileMtime) &&
      Array.isArray(meta.partialLanguages) &&
      meta.partialLanguages.every((language) => typeof language === 'string')
    );
  }
}
