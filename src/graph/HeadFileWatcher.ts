import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

const SHA_RE = /^[0-9a-f]{40}$/i;

export class HeadFileWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private lastSha: string | null = null;
  private disposed = false;

  constructor(
    private readonly workspaceRoot: string,
    private readonly onHeadChange: (prevSha: string | null, newSha: string) => void,
  ) {}

  start(): void {
    if (this.disposables.length > 0) {
      return;
    }

    const headWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceRoot, '.git/HEAD'),
    );
    const refsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceRoot, '.git/refs/heads/**'),
    );
    const onGitChange = (): void => {
      void this.refreshHeadSha();
    };

    this.disposables.push(
      headWatcher,
      refsWatcher,
      headWatcher.onDidChange(onGitChange),
      headWatcher.onDidCreate(onGitChange),
      refsWatcher.onDidChange(onGitChange),
      refsWatcher.onDidCreate(onGitChange),
    );

    void this.refreshHeadSha({ initializeOnly: true });
  }

  dispose(): void {
    this.disposed = true;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private async refreshHeadSha(options: { initializeOnly?: boolean } = {}): Promise<void> {
    if (this.disposed) {
      return;
    }

    try {
      const newSha = await this.resolveHeadSha();
      if (this.disposed || newSha === null) {
        return;
      }

      const prevSha = this.lastSha;
      this.lastSha = newSha;

      if (!options.initializeOnly && prevSha !== newSha) {
        this.onHeadChange(prevSha, newSha);
      }
    } catch (error) {
      console.warn('Unable to resolve Git HEAD for graph refresh:', error);
    }
  }

  private async resolveHeadSha(): Promise<string | null> {
    const headPath = path.join(this.workspaceRoot, '.git', 'HEAD');
    const head = (await readFile(headPath, 'utf8')).trim();

    if (SHA_RE.test(head)) {
      return head;
    }

    const refMatch = /^ref:\s+(.+)$/.exec(head);
    if (refMatch === null) {
      return null;
    }

    const refName = refMatch[1]?.trim();
    if (!refName) {
      return null;
    }

    return (await this.readLooseRef(refName)) ?? (await this.readPackedRef(refName));
  }

  private async readLooseRef(refName: string): Promise<string | null> {
    try {
      const refPath = path.join(this.workspaceRoot, '.git', ...refName.split('/'));
      const sha = (await readFile(refPath, 'utf8')).trim();
      return SHA_RE.test(sha) ? sha : null;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private async readPackedRef(refName: string): Promise<string | null> {
    try {
      const packedRefsPath = path.join(this.workspaceRoot, '.git', 'packed-refs');
      const packedRefs = await readFile(packedRefsPath, 'utf8');

      for (const line of packedRefs.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith('^')) {
          continue;
        }

        const [sha, packedRefName] = trimmed.split(/\s+/, 2);
        if (packedRefName === refName && sha !== undefined && SHA_RE.test(sha)) {
          return sha;
        }
      }

      return null;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
