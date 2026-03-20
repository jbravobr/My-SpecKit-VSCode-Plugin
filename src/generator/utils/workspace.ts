import * as vscode from 'vscode';
import * as path from 'path';

export function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export async function listStoryFiles(dirPath: string): Promise<string[]> {
  try {
    const uri = vscode.Uri.file(dirPath);
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries
      .filter(([name, type]) => type === vscode.FileType.File && name.startsWith('STORY-') && name.endsWith('.md'))
      .map(([name]) => name);
  } catch {
    return [];
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
