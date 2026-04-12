import * as path from 'path';
import * as vscode from 'vscode';

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

export async function listDir(dirPath: string): Promise<string[]> {
  const uri = vscode.Uri.file(dirPath);
  try {
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries.map(([name]) => name);
  } catch {
    return [];
  }
}

export async function deleteFile(filePath: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  try {
    await vscode.workspace.fs.delete(uri);
  } catch {
    // file may not exist
  }
}

export async function deleteDir(dirPath: string): Promise<void> {
  const uri = vscode.Uri.file(dirPath);
  try {
    await vscode.workspace.fs.delete(uri, { recursive: true });
  } catch {
    // directory may not exist
  }
}
