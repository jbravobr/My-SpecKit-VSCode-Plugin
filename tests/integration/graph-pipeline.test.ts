import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TypeScriptImportExtractor } from '../../src/graph/extractors';
import { GraphQuery } from '../../src/graph/GraphQuery';
import { GraphStore } from '../../src/graph/GraphStore';
import { IncrementalUpdater } from '../../src/graph/IncrementalUpdater';
import { SubgraphEmbedder } from '../../src/graph/SubgraphEmbedder';

const artifactRoot = path.join(process.cwd(), '.speckit-test-artifacts', 'graph-pipeline');
let repoRoot: string;

function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function graphConfiguration(): vscode.WorkspaceConfiguration {
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined => {
      if (key === 'enabled') {
        return true as T;
      }
      if (key === 'languages') {
        return ['typescript'] as T;
      }
      if (key === 'ignore') {
        return [] as T;
      }
      if (key === 'updater.flush.budgetMs') {
        return 2000 as T;
      }
      if (key === 'embedder.generate.budgetMs') {
        return 50 as T;
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

async function writeRepoFile(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

async function collectTypeScriptUris(root: string): Promise<vscode.Uri[]> {
  const uris: vscode.Uri[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === '.speckit' || entry.name === 'node_modules') {
        continue;
      }

      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.ts')) {
        uris.push(fileUri(entryPath));
      }
    }
  }

  await visit(root);
  return uris.sort((left, right) => left.fsPath.localeCompare(right.fsPath));
}

async function loadGraphFile(): Promise<unknown> {
  const raw = await readFile(path.join(repoRoot, '.speckit', 'graph.json'), 'utf8');
  return JSON.parse(raw) as unknown;
}

const describeIfGit = gitAvailable() ? describe : describe.skip;

describeIfGit('graph pipeline integration', () => {
  beforeEach(async () => {
    repoRoot = path.join(artifactRoot, randomUUID(), 'repo');
    await mkdir(repoRoot, { recursive: true });
    setWorkspaceFolder(repoRoot);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(graphConfiguration());
    vi.mocked(vscode.workspace.findFiles).mockImplementation(async () =>
      collectTypeScriptUris(repoRoot),
    );

    await writeRepoFile('package.json', '{"name":"graph-pipeline-fixture","private":true}\n');
    await writeRepoFile(
      'src/a.ts',
      'import { B } from "./b";\nimport { C } from "./c";\nexport const a = new B().value + C;\n',
    );
    await writeRepoFile('src/b.ts', 'import { C } from "./c";\nexport class B { value = C; }\n');
    await writeRepoFile('src/c.ts', 'export const C = 1;\n');

    git(['init']);
    git(['config', 'user.email', 'speckit@example.invalid']);
    git(['config', 'user.name', 'SpecKit Test']);
    git(['add', '.']);
    git(['commit', '-m', 'initial graph fixture']);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await rm(path.dirname(repoRoot), {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 50,
      });
    } catch (error) {
      if (process.platform === 'win32') {
        console.warn('Unable to remove graph integration workspace on Windows:', error);
        return;
      }
      throw error;
    }
  });

  it('builds, refreshes, deletes, git-diffs, loads and embeds the graph end-to-end', async () => {
    const store = new GraphStore();
    const updater = new IncrementalUpdater(store, [new TypeScriptImportExtractor()]);

    const initialGraph = await updater.buildFull(repoRoot);
    const graphFileStat = await stat(path.join(repoRoot, '.speckit', 'graph.json'));

    expect(graphFileStat.isFile()).toBe(true);
    expect(initialGraph.nodes.map((node) => node.id).sort()).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ]);
    expect(initialGraph.edges.length).toBeGreaterThanOrEqual(3);

    const bPath = path.join(repoRoot, 'src', 'b.ts');
    const previousHash = initialGraph.meta.perFileHash['src/b.ts'];
    await writeFile(bPath, 'import { C } from "./c";\nexport class B { value = C + 1; }\n', 'utf8');
    updater.touch(fileUri(bPath));
    await updater.flush(repoRoot);
    const afterSave = await store.load(repoRoot);

    expect(afterSave?.meta.perFileHash['src/b.ts']).not.toBe(previousHash);
    expect(afterSave?.nodes.find((node) => node.id === 'src/b.ts')?.symbols).toContain('B');

    const cPath = path.join(repoRoot, 'src', 'c.ts');
    await unlink(cPath);
    updater.touch(fileUri(cPath));
    await updater.flush(repoRoot);
    const afterDelete = await store.load(repoRoot);

    expect(afterDelete?.nodes.some((node) => node.id === 'src/c.ts')).toBe(false);
    expect(
      afterDelete?.edges.some((edge) => edge.from === 'src/c.ts' || edge.to === 'src/c.ts'),
    ).toBe(false);

    const prevSha = git(['rev-parse', 'HEAD']);
    await writeFile(cPath, 'export const C = 2;\n', 'utf8');
    git(['add', '.']);
    git(['commit', '-m', 'update graph fixture']);
    const newSha = git(['rev-parse', 'HEAD']);

    const diffMetrics = await updater.refreshFromGitDiff(repoRoot, prevSha, newSha);
    const afterDiff = await store.load(repoRoot);

    expect(diffMetrics.touchedFiles).toBeGreaterThanOrEqual(2);
    expect(afterDiff?.meta.headSha).toBe(newSha);
    expect(afterDiff?.nodes.map((node) => node.id).sort()).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ]);
    expect(await loadGraphFile()).toEqual(afterDiff);

    const loadedGraph = await store.load(repoRoot);
    expect(loadedGraph).not.toBeNull();
    if (loadedGraph === null) {
      return;
    }

    const markdown = new SubgraphEmbedder(loadedGraph, new GraphQuery(loadedGraph)).generate({
      topN: 3,
    });

    expect(markdown).toContain('src/a.ts');
    expect(markdown).toContain('src/b.ts');
    expect(markdown).toContain('src/c.ts');
  }, 30_000);
});
