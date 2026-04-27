import * as path from 'path';
import * as vscode from 'vscode';
import { TechStackDetection } from '../../fix/Fix';
import { SpecStatus } from '../../story/Story';
import { detectAllStacks, StackDetectorEntry, StackDetectorFs } from './stackDetector';

function isFileNotFound(err: unknown): boolean {
  if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') return true;
  if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')
    return true;
  return false;
}

export function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export async function listStoryFiles(dirPath: string): Promise<string[]> {
  try {
    const uri = vscode.Uri.file(dirPath);
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries
      .filter(
        ([name, type]) =>
          type === vscode.FileType.File &&
          (name.startsWith('US-') || name.startsWith('STORY-')) &&
          name.endsWith('.md'),
      )
      .map(([name]) => name);
  } catch (err: unknown) {
    if (isFileNotFound(err)) return [];
    throw err;
  }
}

export async function listFixFiles(dirPath: string): Promise<string[]> {
  try {
    const uri = vscode.Uri.file(dirPath);
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries
      .filter(
        ([name, type]) =>
          type === vscode.FileType.File && name.startsWith('FIX-') && name.endsWith('.md'),
      )
      .map(([name]) => name);
  } catch (err: unknown) {
    if (isFileNotFound(err)) return [];
    throw err;
  }
}

export async function getActiveStoryPath(): Promise<string | undefined> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return undefined;

  const specDir = path.join(workspaceRoot, '.speckit');
  const files = await listStoryFiles(specDir);
  if (files.length === 0) return undefined;

  const sorted = files.sort();
  return path.join(specDir, sorted[sorted.length - 1]);
}

export async function getActiveSpecPath(): Promise<string | undefined> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return undefined;

  const specDir = path.join(workspaceRoot, '.speckit');
  const [storyFiles, fixFiles] = await Promise.all([
    listStoryFiles(specDir),
    listFixFiles(specDir),
  ]);

  const allFiles = [...storyFiles, ...fixFiles];
  if (allFiles.length === 0) return undefined;

  const statusResults = await Promise.all(
    allFiles.map(async (name) => {
      const fullPath = path.join(specDir, name);
      const status = await readSpecStatus(fullPath);
      return { name, status };
    }),
  );

  const openFiles = statusResults.filter(({ status }) => status === 'open').map(({ name }) => name);

  if (openFiles.length === 0) return undefined;

  openFiles.sort((a, b) => specSortKey(b) - specSortKey(a));
  return path.join(specDir, openFiles[0]);
}

export async function detectTechStack(): Promise<TechStackDetection> {
  const all = await detectAllTechStacks();
  if (all.length === 0) {
    throw new Error(
      'Stack não detectada automaticamente. Nenhum manifesto reconhecido (package.json, pom.xml, build.gradle, *.csproj, requirements.txt, pyproject.toml, go.mod, Cargo.toml, composer.json, Gemfile, build.sbt, Package.swift) foi encontrado nos primeiros 7 níveis do workspace. ' +
        'Adicione um arquivo de dependências ou use /new (STORY) para especificar a stack manualmente.',
    );
  }
  return all[0];
}

/**
 * Detects every tech stack present in the workspace, walking BFS up to 7 levels deep.
 * Results are sorted by depth (shallowest first), then alphabetically by `source`.
 *
 * Use this when the workspace is a monorepo or contains multiple ecosystems
 * (e.g. backend in `services/api/pom.xml` + frontend in `apps/web/package.json`).
 */
export async function detectAllTechStacks(): Promise<TechStackDetection[]> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    throw new Error(
      'Nenhum workspace aberto. Abra uma pasta antes de executar /validate em um fix.',
    );
  }
  const all = await detectAllStacks(workspaceRoot, vscodeStackFs);
  return all;
}

const vscodeStackFs: StackDetectorFs = {
  async readDirectory(dirPath: string): Promise<StackDetectorEntry[]> {
    const uri = vscode.Uri.file(dirPath);
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries.map(([name, type]) => ({
      name,
      isDirectory: type === vscode.FileType.Directory,
      isFile: type === vscode.FileType.File,
    }));
  },
  async readFile(filePath: string): Promise<string> {
    const uri = vscode.Uri.file(filePath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf-8');
  },
  joinPath(...segments: string[]): string {
    return path.join(...segments);
  },
};

// --- Helpers ---

async function readSpecStatus(filePath: string): Promise<SpecStatus> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    const content = Buffer.from(bytes).toString('utf-8');
    const metaMatch = /<!--\s*metadata\s*([\s\S]*?)-->/.exec(content);
    if (!metaMatch) return 'open';
    const statusMatch = /^status:\s*(.+)$/m.exec(metaMatch[1]);
    if (!statusMatch) return 'open';
    const s = statusMatch[1].trim() as SpecStatus;
    const valid: Set<string> = new Set([
      'open',
      'in-progress',
      'review',
      'blocked',
      'done',
      'cancelled',
    ]);
    return valid.has(s) ? s : 'open';
  } catch (err: unknown) {
    if (isFileNotFound(err)) return 'open';
    throw err;
  }
}

function specSortKey(filename: string): number {
  // Timestamp-based IDs: extract YYYYMMDD-HHMM for sorting
  const tsMatch = /(\d{8})-(\d{4})\.md$/.exec(filename);
  if (tsMatch) {
    const sortable = parseInt(tsMatch[1] + tsMatch[2], 10);
    const isFix = filename.startsWith('FIX-') ? 0.5 : 0;
    return sortable + isFix;
  }
  // Legacy sequential IDs: STORY-001, FIX-001
  const seqMatch = /(\d+)\.md$/.exec(filename);
  const id = seqMatch ? parseInt(seqMatch[1], 10) : 0;
  const isFix = filename.startsWith('FIX-') ? 0.5 : 0;
  return id + isFix;
}
