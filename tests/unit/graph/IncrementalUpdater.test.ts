import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLUGIN_VERSION_GRAPH, SCHEMA_VERSION } from '../../../src/graph/constants';
import { CSharpImportExtractor } from '../../../src/graph/extractors/CSharpImportExtractor';
import type { ExtractedFile, ImportExtractor } from '../../../src/graph/extractors/ExtractorTypes';
import { JavaImportExtractor } from '../../../src/graph/extractors/JavaImportExtractor';
import { PythonImportExtractor } from '../../../src/graph/extractors/PythonImportExtractor';
import { TypeScriptImportExtractor } from '../../../src/graph/extractors/TypeScriptImportExtractor';
import { GraphStore } from '../../../src/graph/GraphStore';
import { IncrementalUpdater, UpdateMetrics } from '../../../src/graph/IncrementalUpdater';

const workspaceRoot = path.join(process.cwd(), '.speckit-test-artifacts', 'incremental-updater');

class StubExtractor implements ImportExtractor {
  readonly language = 'typescript';
  readonly version = 'test-1';
  readonly partial = false;

  supports(filePath: string): boolean {
    return filePath.replace(/\\/g, '/').endsWith('.ts');
  }

  extract(filePath: string, content: string, workspaceRootValue: string): ExtractedFile {
    const nodeId = path.relative(workspaceRootValue, filePath).replace(/\\/g, '/');
    const edges: ExtractedFile['edges'] = content.includes('dep')
      ? [{ to: 'src/dep.ts', kind: 'IMPORTS', confidence: 'EXTRACTED' }]
      : [];

    return {
      nodeId,
      language: this.language,
      symbols: content.includes('class A') ? ['A'] : [],
      edges,
    };
  }
}

function graphConfiguration(options: {
  languages?: string[];
  ignore?: string[];
}): vscode.WorkspaceConfiguration {
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined => {
      if (key === 'languages') {
        return (options.languages ?? ['auto']) as T;
      }
      if (key === 'ignore') {
        return (options.ignore ?? []) as T;
      }
      if (key === 'enabled') {
        return true as T;
      }
      return defaultValue;
    },
  } as unknown as vscode.WorkspaceConfiguration;
}

function fileUri(filePath: string): vscode.Uri {
  return vscode.Uri.file(filePath);
}

function setWorkspaceFolder(root: string): void {
  Object.defineProperty(vscode.workspace, 'workspaceFolders', {
    value: [{ uri: fileUri(root) }],
    configurable: true,
  });
}

async function writeWorkspaceFile(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(workspaceRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

beforeEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  await mkdir(workspaceRoot, { recursive: true });
  setWorkspaceFolder(workspaceRoot);
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(graphConfiguration({}));
  vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('IncrementalUpdater', () => {
  it('touch + flush atualiza grafo', async () => {
    const filePath = await writeWorkspaceFile(
      'src/a.ts',
      'import dep from "./dep"; export class A {}',
    );
    const store = new GraphStore();
    const updater = new IncrementalUpdater(store, [new StubExtractor()]);

    updater.touch(fileUri(filePath));
    const metrics = await updater.flush(workspaceRoot);
    const graph = await store.load(workspaceRoot);

    expect(metrics.touchedFiles).toBe(1);
    expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
    expect(graph?.extractorVersions).toEqual({ typescript: 'test-1' });
    expect(graph?.meta.partialLanguages).toEqual([]);
    expect(Date.parse(graph?.meta.builtAt ?? '')).not.toBeNaN();
    expect(graph?.nodes).toEqual([{ id: 'src/a.ts', language: 'typescript', symbols: ['A'] }]);
    expect(graph?.edges).toEqual([
      {
        from: 'src/a.ts',
        to: 'src/dep.ts',
        kind: 'IMPORTS',
        confidence: 'EXTRACTED',
        sourceExtractor: 'typescript',
      },
    ]);
    expect(graph?.meta.perFileHash['src/a.ts']).toMatch(/^[a-f0-9]{64}$/);
    expect(graph?.meta.perFileMtime['src/a.ts']).toBeGreaterThan(0);
  });

  it('touch de arquivo deletado remove nó', async () => {
    const filePath = await writeWorkspaceFile('src/a.ts', 'export class A {}');
    const store = new GraphStore();
    const updater = new IncrementalUpdater(store, [new StubExtractor()]);

    updater.touch(fileUri(filePath));
    await updater.flush(workspaceRoot);
    await unlink(filePath);

    updater.touch(fileUri(filePath));
    await updater.flush(workspaceRoot);
    const graph = await store.load(workspaceRoot);

    expect(graph?.nodes).toEqual([]);
    expect(graph?.edges).toEqual([]);
    expect(graph?.meta.perFileHash).toEqual({});
    expect(graph?.meta.perFileMtime).toEqual({});
    expect(graph?.meta.partialLanguages).toEqual([]);
  });

  it('buildFull em workspace fixture multi-linguagem produz grafo válido', async () => {
    const tsFile = await writeWorkspaceFile(
      'src/a.ts',
      'import { B } from "./b"; export class A {}',
    );
    const javaFile = await writeWorkspaceFile(
      'src/App.java',
      'import java.util.List;\npublic class App {}\n',
    );
    const pythonFile = await writeWorkspaceFile(
      'src/app.py',
      'import os\nclass PyApp(Base):\n    pass\n',
    );
    const csharpFile = await writeWorkspaceFile(
      'src/App.cs',
      'using System;\npublic class App : Base {}\n',
    );
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
      fileUri(tsFile),
      fileUri(javaFile),
      fileUri(pythonFile),
      fileUri(csharpFile),
    ]);
    const store = new GraphStore();
    const updater = new IncrementalUpdater(store, [
      new TypeScriptImportExtractor(),
      new JavaImportExtractor(),
      new PythonImportExtractor(),
      new CSharpImportExtractor(),
    ]);

    const graph = await updater.buildFull(workspaceRoot);
    const persisted = JSON.parse(
      await readFile(path.join(workspaceRoot, '.speckit', 'graph.json'), 'utf8'),
    ) as typeof graph;

    expect(graph.schemaVersion).toBe(SCHEMA_VERSION);
    expect(graph.pluginVersion).toBe(PLUGIN_VERSION_GRAPH);
    expect(graph.extractorVersions).toEqual({
      typescript: '1',
      java: '1',
      python: '1',
      csharp: '1',
    });
    expect(graph.nodes.map((node) => node.id)).toEqual([
      'src/a.ts',
      'src/App.cs',
      'src/App.java',
      'src/app.py',
    ]);
    expect(graph.nodes.find((node) => node.id === 'src/a.ts')?.symbols).toContain('A');
    expect(graph.nodes.find((node) => node.id === 'src/App.java')?.symbols).toContain('App');
    expect(graph.nodes.find((node) => node.id === 'src/app.py')?.symbols).toContain('PyApp');
    expect(graph.nodes.find((node) => node.id === 'src/App.cs')?.symbols).toContain('App');
    const languageByNode = new Map(graph.nodes.map((node) => [node.id, node.language]));
    expect(new Set(graph.edges.map((edge) => languageByNode.get(edge.from)))).toEqual(
      new Set(['typescript', 'java', 'python', 'csharp']),
    );
    expect(graph.meta.partialLanguages).toEqual(['java', 'python', 'csharp']);
    expect(persisted).toEqual(graph);
  });

  it('debounce coalesce múltiplos touch', async () => {
    const metrics: UpdateMetrics[] = [];
    const firstFile = await writeWorkspaceFile('src/a.ts', 'export class A {}');
    const secondFile = await writeWorkspaceFile('src/b.ts', 'export class B {}');
    const updater = new IncrementalUpdater(new GraphStore(), [new StubExtractor()], 30, (metric) =>
      metrics.push(metric),
    );

    updater.touch(fileUri(firstFile));
    await new Promise((resolve) => setTimeout(resolve, 15));
    updater.touch(fileUri(secondFile));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(metrics).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(metrics).toHaveLength(1);
    expect(metrics[0]?.touchedFiles).toBe(2);
  });

  it('cancel limpa timer', async () => {
    vi.useFakeTimers();
    const metrics: UpdateMetrics[] = [];
    const filePath = await writeWorkspaceFile('src/a.ts', 'export class A {}');
    const store = new GraphStore();
    const updater = new IncrementalUpdater(store, [new StubExtractor()], 25, (metric) =>
      metrics.push(metric),
    );

    updater.touch(fileUri(filePath));
    updater.cancel();
    await vi.advanceTimersByTimeAsync(25);

    expect(metrics).toEqual([]);
    expect(await store.exists(workspaceRoot)).toBe(false);
  });
});
