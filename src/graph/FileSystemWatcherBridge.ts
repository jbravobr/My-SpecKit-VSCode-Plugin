import path from 'node:path';
import * as vscode from 'vscode';
import { IncrementalUpdater } from './IncrementalUpdater';

const DEFAULT_LANGUAGES = ['typescript', 'javascript', 'python', 'java', 'csharp'] as const;
const LANGUAGE_GLOBS: Record<(typeof DEFAULT_LANGUAGES)[number], string> = {
  typescript: '**/*.{ts,tsx,mts,cts}',
  javascript: '**/*.{js,jsx,mjs,cjs}',
  python: '**/*.py',
  java: '**/*.java',
  csharp: '**/*.cs',
};
const DEFAULT_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/out/**',
  '**/coverage/**',
  '**/.git/**',
];

type SupportedLanguage = (typeof DEFAULT_LANGUAGES)[number];

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegex(glob: string): RegExp {
  let pattern = '';
  let normalizedGlob = normalizePath(glob);

  if (normalizedGlob.startsWith('**/')) {
    pattern = '(?:.*/)?';
    normalizedGlob = normalizedGlob.slice(3);
  }

  for (let index = 0; index < normalizedGlob.length; index += 1) {
    const char = normalizedGlob[index];
    const next = normalizedGlob[index + 1];

    if (char === '*' && next === '*') {
      pattern += '.*';
      index += 1;
      continue;
    }

    if (char === '*') {
      pattern += '[^/]*';
      continue;
    }

    if (char === '?') {
      pattern += '[^/]';
      continue;
    }

    pattern += escapeRegex(char ?? '');
  }

  return new RegExp(`^${pattern}$`, 'i');
}

function configuredLanguages(): SupportedLanguage[] {
  const configured = vscode.workspace
    .getConfiguration('speckit.graph')
    .get<string[]>('languages', [...DEFAULT_LANGUAGES]);
  const requested =
    configured.includes('auto') || configured.length === 0 ? DEFAULT_LANGUAGES : configured;
  const unique = new Set<SupportedLanguage>();

  for (const language of requested) {
    if (isSupportedLanguage(language)) {
      unique.add(language);
    }
  }

  return [...unique];
}

function isSupportedLanguage(language: string): language is SupportedLanguage {
  return DEFAULT_LANGUAGES.includes(language as SupportedLanguage);
}

export class FileSystemWatcherBridge implements vscode.Disposable {
  private readonly watchers: vscode.FileSystemWatcher[] = [];
  private readonly listenerDisposables: vscode.Disposable[] = [];

  constructor(
    private readonly updater: IncrementalUpdater,
    private readonly workspaceRoot: string,
  ) {}

  start(): void {
    if (this.watchers.length > 0) {
      return;
    }

    for (const language of configuredLanguages()) {
      const watcher = vscode.workspace.createFileSystemWatcher(LANGUAGE_GLOBS[language]);
      this.watchers.push(watcher);
      this.listenerDisposables.push(
        watcher.onDidCreate((uri) => this.touchIfIncluded(uri)),
        watcher.onDidChange((uri) => this.touchIfIncluded(uri)),
        watcher.onDidDelete((uri) => this.touchIfIncluded(uri)),
      );
    }
  }

  dispose(): void {
    for (const disposable of this.listenerDisposables) {
      disposable.dispose();
    }
    this.listenerDisposables.length = 0;

    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers.length = 0;
  }

  private touchIfIncluded(uri: vscode.Uri): void {
    if (this.isIgnored(uri.fsPath)) {
      return;
    }

    this.updater.touch(uri);
  }

  private isIgnored(filePath: string): boolean {
    const relativePath = normalizePath(path.relative(this.workspaceRoot, filePath));
    const comparablePath = relativePath.startsWith('..') ? normalizePath(filePath) : relativePath;
    const configured = vscode.workspace
      .getConfiguration('speckit.graph')
      .get<string[]>('ignore', []);
    const ignoreRegexes = [...DEFAULT_IGNORE_GLOBS, ...configured].map(globToRegex);

    return ignoreRegexes.some((regex) => regex.test(comparablePath));
  }
}
