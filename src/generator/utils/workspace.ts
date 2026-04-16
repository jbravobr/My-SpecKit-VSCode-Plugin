import * as path from 'path';
import * as vscode from 'vscode';
import { TechStackDetection } from '../../fix/Fix';
import { SpecStatus } from '../../story/Story';

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
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    throw new Error(
      'Nenhum workspace aberto. Abra uma pasta antes de executar /validate em um fix.',
    );
  }

  // 1. package.json
  try {
    const pkgUri = vscode.Uri.file(path.join(workspaceRoot, 'package.json'));
    const bytes = await vscode.workspace.fs.readFile(pkgUri);
    const pkg = JSON.parse(Buffer.from(bytes).toString('utf-8'));
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

    const hasTsConfig = await fileExistsAt(path.join(workspaceRoot, 'tsconfig.json'));
    const language = hasTsConfig ? 'typescript' : 'javascript';

    let framework: import('../../story/Story').Framework = 'other';
    if (deps['react'] || deps['next'] || deps['next.js']) framework = 'react';
    else if (deps['@angular/core']) framework = 'angular';

    const architecture = await inferArchitecture(workspaceRoot);
    const target = await inferTarget(workspaceRoot, deps);

    return {
      language,
      framework,
      architecture,
      target,
      projectStage: 'brownfield',
      confidence: framework !== 'other' ? 'high' : 'low',
      source: 'package.json',
    };
  } catch {
    // fall through
  }

  // 2. pom.xml
  try {
    const pomUri = vscode.Uri.file(path.join(workspaceRoot, 'pom.xml'));
    const bytes = await vscode.workspace.fs.readFile(pomUri);
    const content = Buffer.from(bytes).toString('utf-8');
    const framework: import('../../story/Story').Framework = content.includes('spring-boot')
      ? 'springboot'
      : 'other';
    const architecture = await inferArchitecture(workspaceRoot);
    const messaging =
      content.includes('spring-kafka') || content.includes('kafka-clients')
        ? ('kafka' as const)
        : undefined;
    return {
      language: 'java',
      framework,
      architecture,
      target: 'backend',
      ...(messaging ? { messaging } : {}),
      projectStage: 'brownfield',
      confidence: 'high',
      source: 'pom.xml',
    };
  } catch {
    // fall through
  }

  // 3. *.csproj
  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(workspaceRoot));
    const csproj = entries.find(
      ([name, type]) => type === vscode.FileType.File && name.endsWith('.csproj'),
    );
    if (csproj) {
      const architecture = await inferArchitecture(workspaceRoot);
      return {
        language: 'csharp',
        framework: 'dotnet',
        architecture,
        target: 'backend',
        projectStage: 'brownfield',
        confidence: 'high',
        source: csproj[0],
      };
    }
  } catch {
    // fall through
  }

  // 4. requirements.txt / pyproject.toml
  for (const pyFile of ['requirements.txt', 'pyproject.toml']) {
    try {
      const uri = vscode.Uri.file(path.join(workspaceRoot, pyFile));
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString('utf-8');
      const framework: import('../../story/Story').Framework = content
        .toLowerCase()
        .includes('fastapi')
        ? 'fastapi'
        : 'other';
      const architecture = await inferArchitecture(workspaceRoot);
      return {
        language: 'python',
        framework,
        architecture,
        target: 'backend',
        projectStage: 'brownfield',
        confidence: framework !== 'other' ? 'high' : 'low',
        source: pyFile,
      };
    } catch {
      // fall through
    }
  }

  throw new Error(
    'Stack não detectada automaticamente. Nenhum arquivo reconhecido (package.json, pom.xml, *.csproj, requirements.txt, pyproject.toml) foi encontrado no workspace. ' +
      'Adicione um arquivo de dependências ou use /new (STORY) para especificar a stack manualmente.',
  );
}

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

async function fileExistsAt(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch (err: unknown) {
    if (isFileNotFound(err)) return false;
    throw err;
  }
}

async function inferArchitecture(workspaceRoot: string): Promise<string | undefined> {
  try {
    const srcUri = vscode.Uri.file(path.join(workspaceRoot, 'src'));
    const entries = await vscode.workspace.fs.readDirectory(srcUri);
    const dirs = entries
      .filter(([, type]) => type === vscode.FileType.Directory)
      .map(([name]) => name);
    if (dirs.includes('domain') && dirs.includes('ports')) return 'hexagonal';
    if (dirs.includes('controllers') && dirs.includes('services') && dirs.includes('repositories'))
      return 'layered';
  } catch {
    // no src/ dir or can't read
  }
  return undefined;
}

async function inferTarget(
  workspaceRoot: string,
  deps: Record<string, unknown>,
): Promise<'backend' | 'frontend' | 'bff' | 'script' | 'library'> {
  const hasFrontendDep = Boolean(deps['react'] || deps['@angular/core'] || deps['vue']);
  const hasBackendDep = Boolean(
    deps['express'] || deps['fastify'] || deps['koa'] || deps['nestjs'],
  );
  if (hasFrontendDep && hasBackendDep) return 'bff';
  if (hasFrontendDep) return 'frontend';
  if (hasBackendDep) return 'backend';
  try {
    const srcUri = vscode.Uri.file(path.join(workspaceRoot, 'src'));
    const entries = await vscode.workspace.fs.readDirectory(srcUri);
    const dirs = entries
      .filter(([, type]) => type === vscode.FileType.Directory)
      .map(([name]) => name);
    if (dirs.includes('components') || dirs.includes('pages')) return 'frontend';
    if (dirs.includes('controllers') || dirs.includes('routes')) return 'backend';
  } catch {
    // ignore
  }
  return 'backend';
}
