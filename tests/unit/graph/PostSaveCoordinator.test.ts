import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphStore } from '../../../src/graph/GraphStore';
import { IncrementalUpdater } from '../../../src/graph/IncrementalUpdater';
import { PostSaveCoordinator } from '../../../src/graph/PostSaveCoordinator';

type SavedDocument = {
  uri: vscode.Uri;
  languageId: string;
};

type SaveHandler = (doc: SavedDocument) => void;

const vscodeMock = vi.hoisted(() => {
  let saveHandler: SaveHandler | undefined;
  const saveSubscription = { dispose: vi.fn() };
  let graphEnabled = true;

  return {
    saveSubscription,
    setGraphEnabled: (enabled: boolean): void => {
      graphEnabled = enabled;
    },
    emitSave: (doc: SavedDocument): void => {
      saveHandler?.(doc);
    },
    onDidSaveTextDocument: vi.fn((handler: SaveHandler) => {
      saveHandler = handler;
      saveSubscription.dispose.mockImplementation(() => {
        saveHandler = undefined;
      });
      return saveSubscription;
    }),
    getConfiguration: vi.fn(() => ({
      get: <T>(key: string, defaultValue?: T): T | undefined => {
        if (key === 'enabled') {
          return graphEnabled as T;
        }
        return defaultValue;
      },
    })),
  };
});

vi.mock('vscode', () => ({
  workspace: {
    onDidSaveTextDocument: vscodeMock.onDidSaveTextDocument,
    getConfiguration: vscodeMock.getConfiguration,
  },
  Uri: {
    file: (filePath: string) => ({ fsPath: filePath, toString: () => `file://${filePath}` }),
  },
}));

function createUpdater(): IncrementalUpdater {
  return new IncrementalUpdater(new GraphStore(), []);
}

describe('PostSaveCoordinator', () => {
  beforeEach(() => {
    vscodeMock.onDidSaveTextDocument.mockClear();
    vscodeMock.getConfiguration.mockClear();
    vscodeMock.saveSubscription.dispose.mockClear();
    vscodeMock.setGraphEnabled(true);
  });

  it('routes TypeScript saves to graph updater and CRAP runner', () => {
    const updater = createUpdater();
    const touchSpy = vi.spyOn(updater, 'touch');
    const crapRunner = { run: vi.fn<(uri: vscode.Uri) => void>() };
    const coordinator = new PostSaveCoordinator(updater, crapRunner, 'C:\\workspace');

    coordinator.start();
    const uri = vscode.Uri.file('C:\\workspace\\src\\app.ts');
    vscodeMock.emitSave({ uri, languageId: 'typescript' });

    expect(touchSpy).toHaveBeenCalledWith(uri);
    expect(crapRunner.run).toHaveBeenCalledWith(uri);
  });

  it('routes markdown saves only to CRAP runner', () => {
    const updater = createUpdater();
    const touchSpy = vi.spyOn(updater, 'touch');
    const crapRunner = { run: vi.fn<(uri: vscode.Uri) => void>() };
    const coordinator = new PostSaveCoordinator(updater, crapRunner, 'C:\\workspace');

    coordinator.start();
    const uri = vscode.Uri.file('C:\\workspace\\README.md');
    vscodeMock.emitSave({ uri, languageId: 'markdown' });

    expect(touchSpy).not.toHaveBeenCalled();
    expect(crapRunner.run).toHaveBeenCalledWith(uri);
  });

  it('honors speckit.graph.enabled=false and keeps CRAP runner active', () => {
    const updater = createUpdater();
    const touchSpy = vi.spyOn(updater, 'touch');
    const crapRunner = { run: vi.fn<(uri: vscode.Uri) => void>() };
    const coordinator = new PostSaveCoordinator(updater, crapRunner, 'C:\\workspace');

    vscodeMock.setGraphEnabled(false);
    coordinator.start();
    const uri = vscode.Uri.file('C:\\workspace\\src\\app.ts');
    vscodeMock.emitSave({ uri, languageId: 'typescript' });

    expect(touchSpy).not.toHaveBeenCalled();
    expect(crapRunner.run).toHaveBeenCalledWith(uri);
    expect(vscodeMock.getConfiguration).toHaveBeenCalledWith('speckit.graph');
  });

  it('allows a null CRAP runner while keeping graph updates active', () => {
    const updater = createUpdater();
    const touchSpy = vi.spyOn(updater, 'touch');
    const coordinator = new PostSaveCoordinator(updater, null, 'C:\\workspace');

    coordinator.start();
    const uri = vscode.Uri.file('C:\\workspace\\src\\app.ts');
    vscodeMock.emitSave({ uri, languageId: 'typescript' });

    expect(touchSpy).toHaveBeenCalledWith(uri);
  });

  it('registers only one listener and disposes it', () => {
    const updater = createUpdater();
    const touchSpy = vi.spyOn(updater, 'touch');
    const crapRunner = { run: vi.fn<(uri: vscode.Uri) => void>() };
    const coordinator = new PostSaveCoordinator(updater, crapRunner, 'C:\\workspace');

    coordinator.start();
    coordinator.start();
    coordinator.dispose();
    vscodeMock.emitSave({
      uri: vscode.Uri.file('C:\\workspace\\src\\app.ts'),
      languageId: 'typescript',
    });

    expect(vscodeMock.onDidSaveTextDocument).toHaveBeenCalledTimes(1);
    expect(vscodeMock.saveSubscription.dispose).toHaveBeenCalledTimes(1);
    expect(touchSpy).not.toHaveBeenCalled();
    expect(crapRunner.run).not.toHaveBeenCalled();
  });
});
