import * as vscode from 'vscode';
import { vscodeFileSystem } from '../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../generator/utils/VscodeWorkspace';
import { runSpecHeuristicOnSave } from './SpecAutoValidationRunner';

const DEBOUNCE_MS = 500;

export function createSpecFileWatcher(context: vscode.ExtensionContext): vscode.FileSystemWatcher {
  const watcher = vscode.workspace.createFileSystemWatcher('**/.speckit/**/*.md');

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function onSpecChange(uri: vscode.Uri): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const fileName = uri.fsPath.split(/[\\/]/).pop() ?? '';
      vscode.window.setStatusBarMessage(`SpecKit: ${fileName} atualizado`, 3000);
      // Auto-validation: spec save triggers heuristic disciplines check.
      // Best-effort, never throws, never blocks the editor.
      void (async () => {
        try {
          const root = vscodeWorkspace.getWorkspaceRoot();
          if (!root) return;
          await runSpecHeuristicOnSave({
            fs: vscodeFileSystem,
            workspaceRoot: root,
            specPath: uri.fsPath,
          });
        } catch {
          // swallow — informational only
        }
      })();
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
