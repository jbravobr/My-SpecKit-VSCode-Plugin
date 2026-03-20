import * as vscode from 'vscode';
import * as path from 'path';

export async function ensureDir(dirPath: string): Promise<void> {
  const uri = vscode.Uri.file(dirPath);
  try {
    await vscode.workspace.fs.createDirectory(uri);
  } catch {
    // directory already exists
  }
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const encoded = new TextEncoder().encode(content);
  await vscode.workspace.fs.writeFile(uri, encoded);
}

export async function readFile(filePath: string): Promise<string> {
  const uri = vscode.Uri.file(filePath);
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder().decode(bytes);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}

export function joinPath(...parts: string[]): string {
  return path.join(...parts);
}
