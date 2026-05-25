import * as vscode from 'vscode';

const GIT_HEAD_GLOB = '.git/HEAD';

/**
 * Watches Git HEAD changes so the graph can be refreshed after branch movement.
 * This shell registers the watcher and emits placeholder SHA values until Git resolution exists.
 */
export class HeadFileWatcher {
  start(
    context: vscode.ExtensionContext,
    onHeadChange: (prevSha: string, headSha: string) => void,
  ): void {
    const watcher = vscode.workspace.createFileSystemWatcher(GIT_HEAD_GLOB);
    const changeDisposable = watcher.onDidChange(() => onHeadChange('', ''));
    const createDisposable = watcher.onDidCreate(() => onHeadChange('', ''));

    context.subscriptions.push(watcher, changeDisposable, createDisposable);
  }
}
