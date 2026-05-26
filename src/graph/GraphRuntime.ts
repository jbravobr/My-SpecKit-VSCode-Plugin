import * as vscode from 'vscode';
import { vscodeFileSystem } from '../generator/utils/VscodeFileSystem';
import { ensureGraphExists } from './GraphAutoBuilder';
import type { EnsureGraphResult } from './GraphAutoBuilder';
import { FileSystemWatcherBridge } from './FileSystemWatcherBridge';
import {
  CSharpImportExtractor,
  JavaImportExtractor,
  JavaScriptImportExtractor,
  PythonImportExtractor,
  TypeScriptImportExtractor,
} from './extractors';
import { GraphFreshnessGate } from './GraphFreshnessGate';
import { GraphStore } from './GraphStore';
import { IncrementalUpdater } from './IncrementalUpdater';

export interface GraphRuntime extends vscode.Disposable {
  store: GraphStore;
  updater: IncrementalUpdater;
  gate: GraphFreshnessGate;
  watcher: FileSystemWatcherBridge;
  /** Ensures the persisted graph exists and is fresh enough for silent runtime use. */
  ensureGraph(): Promise<EnsureGraphResult>;
}

export function createGraphRuntime(workspaceRoot: string | undefined): GraphRuntime {
  const store = new GraphStore();
  const updater = new IncrementalUpdater(store, [
    new TypeScriptImportExtractor(),
    new JavaScriptImportExtractor(),
    new PythonImportExtractor(),
    new JavaImportExtractor(),
    new CSharpImportExtractor(),
  ]);
  const gate = new GraphFreshnessGate(store, () => {
    if (workspaceRoot === undefined) {
      return;
    }

    void updater.flush(workspaceRoot).catch((error: unknown) => {
      console.warn('Unable to flush stale graph in background:', error);
    });
  });
  const watcher = new FileSystemWatcherBridge(updater, workspaceRoot ?? '');
  const enabled = vscode.workspace.getConfiguration('speckit.graph').get<boolean>('enabled', true);

  if (enabled && workspaceRoot !== undefined) {
    watcher.start();
  }

  return {
    store,
    updater,
    gate,
    watcher,
    ensureGraph: async () => {
      if (workspaceRoot === undefined) {
        return {
          built: false,
          fresh: false,
          error: 'Workspace root is undefined.',
        };
      }

      return ensureGraphExists(workspaceRoot, vscodeFileSystem);
    },
    dispose: () => {
      watcher.dispose();
      updater.cancel();
    },
  };
}
