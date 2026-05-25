import * as vscode from 'vscode';

const GRAPH_FILE_GLOB = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,java,py,cs}';

/**
 * Bridges VS Code file-system watcher events into graph invalidation callbacks.
 * This shell registers the source-code glob and stores disposables on the extension context.
 */
export class FileSystemWatcherBridge {
  start(context: vscode.ExtensionContext, onChange: (uri: vscode.Uri) => void): void {
    const watcher = vscode.workspace.createFileSystemWatcher(GRAPH_FILE_GLOB);
    const changeDisposable = watcher.onDidChange(onChange);
    const createDisposable = watcher.onDidCreate(onChange);
    const deleteDisposable = watcher.onDidDelete(onChange);

    context.subscriptions.push(watcher, changeDisposable, createDisposable, deleteDisposable);
  }
}
