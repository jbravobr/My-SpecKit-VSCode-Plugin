import * as path from 'node:path';
import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSystemWatcherBridge } from '../../../src/graph/FileSystemWatcherBridge';
import { IncrementalUpdater } from '../../../src/graph/IncrementalUpdater';

interface CapturedWatcher extends vscode.FileSystemWatcher {
  emitCreate(uri: vscode.Uri): void;
  emitChange(uri: vscode.Uri): void;
  emitDelete(uri: vscode.Uri): void;
  disposeMock: ReturnType<typeof vi.fn>;
}

function graphConfiguration(options: {
  languages?: string[];
  ignore?: string[];
}): vscode.WorkspaceConfiguration {
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined => {
      if (key === 'languages') {
        return (options.languages ?? ['typescript', 'javascript', 'python', 'java', 'csharp']) as T;
      }
      if (key === 'ignore') {
        return (options.ignore ?? []) as T;
      }
      if (key === 'enabled') {
        return true as T;
      }
      return defaultValue;
    },
  } as vscode.WorkspaceConfiguration;
}

function createCapturedWatcher(): CapturedWatcher {
  const createListeners: Array<(uri: vscode.Uri) => void> = [];
  const changeListeners: Array<(uri: vscode.Uri) => void> = [];
  const deleteListeners: Array<(uri: vscode.Uri) => void> = [];
  const disposeMock = vi.fn();
  const listenerDisposable: vscode.Disposable = { dispose: vi.fn() };

  return {
    ignoreCreateEvents: false,
    ignoreChangeEvents: false,
    ignoreDeleteEvents: false,
    onDidCreate: (listener: (uri: vscode.Uri) => void): vscode.Disposable => {
      createListeners.push(listener);
      return listenerDisposable;
    },
    onDidChange: (listener: (uri: vscode.Uri) => void): vscode.Disposable => {
      changeListeners.push(listener);
      return listenerDisposable;
    },
    onDidDelete: (listener: (uri: vscode.Uri) => void): vscode.Disposable => {
      deleteListeners.push(listener);
      return listenerDisposable;
    },
    dispose: disposeMock,
    emitCreate: (uri: vscode.Uri) => createListeners.forEach((listener) => listener(uri)),
    emitChange: (uri: vscode.Uri) => changeListeners.forEach((listener) => listener(uri)),
    emitDelete: (uri: vscode.Uri) => deleteListeners.forEach((listener) => listener(uri)),
    disposeMock,
  };
}

function createUpdater(): IncrementalUpdater {
  return {
    touch: vi.fn(),
  } as unknown as IncrementalUpdater;
}

describe('FileSystemWatcherBridge', () => {
  const workspaceRoot = path.join(process.cwd(), '.speckit-test-artifacts', 'watcher');
  let watchers: CapturedWatcher[];

  beforeEach(() => {
    watchers = [];
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(graphConfiguration({}));
    vi.mocked(vscode.workspace.createFileSystemWatcher).mockImplementation(() => {
      const watcher = createCapturedWatcher();
      watchers.push(watcher);
      return watcher;
    });
  });

  it('start cria um watcher por linguagem habilitada', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      graphConfiguration({ languages: ['typescript', 'python'] }),
    );
    const bridge = new FileSystemWatcherBridge(createUpdater(), workspaceRoot);

    bridge.start();

    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(2);
    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenNthCalledWith(
      1,
      '**/*.{ts,tsx,mts,cts}',
    );
    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenNthCalledWith(2, '**/*.py');
  });

  it('eventos create change delete disparam updater.touch', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      graphConfiguration({ languages: ['typescript'] }),
    );
    const updater = createUpdater();
    const bridge = new FileSystemWatcherBridge(updater, workspaceRoot);
    const fileUri = vscode.Uri.file(path.join(workspaceRoot, 'src', 'app.ts'));

    bridge.start();
    watchers[0]?.emitCreate(fileUri);
    watchers[0]?.emitChange(fileUri);
    watchers[0]?.emitDelete(fileUri);

    expect(updater.touch).toHaveBeenCalledTimes(3);
    expect(updater.touch).toHaveBeenNthCalledWith(1, fileUri);
    expect(updater.touch).toHaveBeenNthCalledWith(2, fileUri);
    expect(updater.touch).toHaveBeenNthCalledWith(3, fileUri);
  });

  it('ignore glob bloqueia touch', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      graphConfiguration({ languages: ['typescript'], ignore: ['**/generated/**'] }),
    );
    const updater = createUpdater();
    const bridge = new FileSystemWatcherBridge(updater, workspaceRoot);
    const configuredIgnoredUri = vscode.Uri.file(
      path.join(workspaceRoot, 'src', 'generated', 'api.ts'),
    );
    const defaultIgnoredUri = vscode.Uri.file(path.join(workspaceRoot, 'node_modules', 'dep.ts'));
    const includedUri = vscode.Uri.file(path.join(workspaceRoot, 'src', 'app.ts'));

    bridge.start();
    watchers[0]?.emitChange(configuredIgnoredUri);
    watchers[0]?.emitChange(defaultIgnoredUri);
    watchers[0]?.emitChange(includedUri);

    expect(updater.touch).toHaveBeenCalledTimes(1);
    expect(updater.touch).toHaveBeenCalledWith(includedUri);
  });
  it('dispose chama dispose em todos watchers', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      graphConfiguration({ languages: ['typescript', 'javascript', 'python'] }),
    );
    const bridge = new FileSystemWatcherBridge(createUpdater(), workspaceRoot);

    bridge.start();
    bridge.dispose();

    expect(watchers).toHaveLength(3);
    for (const watcher of watchers) {
      expect(watcher.disposeMock).toHaveBeenCalledTimes(1);
    }
  });
});
