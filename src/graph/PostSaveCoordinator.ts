import * as vscode from 'vscode';
import { IncrementalUpdater } from './IncrementalUpdater';

const SUPPORTED_GRAPH_LANGUAGES = new Set([
  'typescript',
  'typescriptreact',
  'javascript',
  'javascriptreact',
  'python',
  'java',
  'csharp',
]);

export interface PostSaveCoordinatorOptions {
  graphDebounceMs?: number;
  crapDebounceMs?: number;
}

export class PostSaveCoordinator implements vscode.Disposable {
  private subscription: vscode.Disposable | undefined;

  constructor(
    private readonly graphUpdater: IncrementalUpdater,
    private readonly crapRunner: { run(uri: vscode.Uri): void } | null,
    private readonly workspaceRoot: string,
    private readonly options: PostSaveCoordinatorOptions = {},
  ) {}

  start(): void {
    if (this.subscription !== undefined) {
      return;
    }

    this.subscription = vscode.workspace.onDidSaveTextDocument((doc) => {
      this.crapRunner?.run(doc.uri);

      if (!SUPPORTED_GRAPH_LANGUAGES.has(doc.languageId)) {
        return;
      }

      const enabled = vscode.workspace
        .getConfiguration('speckit.graph')
        .get<boolean>('enabled', true);
      if (!enabled) {
        return;
      }

      this.graphUpdater.touch(doc.uri);
    });
  }

  dispose(): void {
    this.subscription?.dispose();
    this.subscription = undefined;
    void this.workspaceRoot;
    void this.options;
  }
}
