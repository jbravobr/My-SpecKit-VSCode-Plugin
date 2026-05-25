import * as vscode from 'vscode';

/**
 * Provides the single post-save event bus used by graph and quality refresh handlers.
 * This shell reserves handler registration without wiring VS Code save events yet.
 */
export class PostSaveCoordinator {
  register(handler: {
    id: string;
    debounceMs: number;
    onSave: (uri: vscode.Uri) => Promise<void>;
  }): vscode.Disposable {
    void handler;
    return new vscode.Disposable(() => undefined);
  }
}
