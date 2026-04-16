import * as vscode from 'vscode';

const DEBOUNCE_MS = 500;

export function createSpecFileWatcher(context: vscode.ExtensionContext): vscode.FileSystemWatcher {
  const watcher = vscode.workspace.createFileSystemWatcher('**/.speckit/**/*.md');

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function onSpecChange(uri: vscode.Uri): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const fileName = uri.fsPath.split(/[\\/]/).pop() ?? '';
      vscode.window.setStatusBarMessage(`SpecKit: ${fileName} atualizado`, 3000);
    }, DEBOUNCE_MS);
  }

  watcher.onDidChange(onSpecChange);
  watcher.onDidCreate((uri) => {
    const fileName = uri.fsPath.split(/[\\/]/).pop() ?? '';
    vscode.window.setStatusBarMessage(`SpecKit: ${fileName} criado`, 3000);
  });
  watcher.onDidDelete((uri) => {
    const fileName = uri.fsPath.split(/[\\/]/).pop() ?? '';
    vscode.window.setStatusBarMessage(`SpecKit: ${fileName} removido`, 3000);
  });

  context.subscriptions.push(watcher);
  return watcher;
}
