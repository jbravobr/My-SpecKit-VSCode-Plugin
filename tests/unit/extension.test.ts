import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscodeMock = vi.hoisted(() => {
  const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
  const getConfiguration = vi.fn(() => ({
    get: <T>(_: string, defaultValue?: T): T | undefined => defaultValue,
  }));

  const registerCommand = vi.fn((command: string, handler: (...args: unknown[]) => unknown) => {
    registeredCommands.set(command, handler);
    return { dispose: vi.fn(() => registeredCommands.delete(command)) };
  });

  return {
    registeredCommands,
    registerCommand,
    executeCommand: vi.fn(),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(async () => 'Executar'),
    onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    })),
    relativePattern: vi.fn((base: string, pattern: string) => ({ base, pattern })),
    getConfiguration,
  };
});

vi.mock('vscode', () => ({
  commands: {
    registerCommand: vscodeMock.registerCommand,
    executeCommand: vscodeMock.executeCommand,
  },
  workspace: {
    workspaceFolders: undefined,
    onDidSaveTextDocument: vscodeMock.onDidSaveTextDocument,
    createFileSystemWatcher: vscodeMock.createFileSystemWatcher,
    getConfiguration: vscodeMock.getConfiguration,
  },
  window: {
    showErrorMessage: vscodeMock.showErrorMessage,
    showInformationMessage: vscodeMock.showInformationMessage,
    showWarningMessage: vscodeMock.showWarningMessage,
    createStatusBarItem: vi.fn(() => ({
      text: '',
      tooltip: '',
      command: '',
      show: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  languages: {
    createDiagnosticCollection: vi.fn(() => ({
      clear: vi.fn(),
      dispose: vi.fn(),
      set: vi.fn(),
    })),
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Range: class {
    constructor(
      public a: number,
      public b: number,
      public c: number,
      public d: number,
    ) {}
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, toString: () => 'file://' + p }),
    parse: (s: string) => ({ toString: () => s }),
  },
  Diagnostic: class {
    constructor(
      public range: unknown,
      public message: string,
      public severity: number,
    ) {}
    source = '';
  },
  MarkdownString: class {
    constructor(public value: string) {}
  },
  RelativePattern: vscodeMock.relativePattern,
}));

vi.mock('../../src/ui/SpeckitStatusBar', () => ({
  SpeckitStatusBar: class {
    refresh = vi.fn();
    dispose = vi.fn();
  },
  COMMAND_OPEN_METRICS: 'speckit.openMetrics',
}));

vi.mock('../../src/ui/SpeckitDiagnostics', () => ({
  SpeckitDiagnostics: class {
    refresh = vi.fn();
    dispose = vi.fn();
  },
}));

vi.mock('../../src/participant/speckitParticipant', () => ({
  registerSpeckitParticipant: vi.fn(),
}));

vi.mock('../../src/workflow/SpecFileWatcher', () => ({
  createSpecFileWatcher: vi.fn(),
}));

vi.mock('../../src/workflow/PostSaveCommitNotifier', () => ({
  checkPostSavePendingCommit: vi.fn(),
}));

import { activate } from '../../src/extension';

describe('extension quick action commands', () => {
  beforeEach(() => {
    vscodeMock.registeredCommands.clear();
    vscodeMock.registerCommand.mockClear();
    vscodeMock.executeCommand.mockClear();
    vscodeMock.showErrorMessage.mockClear();
    vscodeMock.showInformationMessage.mockClear();
    vscodeMock.showWarningMessage.mockClear();
    vscodeMock.onDidSaveTextDocument.mockClear();
    vscodeMock.createFileSystemWatcher.mockClear();
    vscodeMock.getConfiguration.mockClear();
  });

  it('registers and executes the dedicated quick action command', async () => {
    const context = { subscriptions: [] } as never;

    activate(context);

    expect(vscodeMock.registeredCommands.has('speckit.openChatWithQuery')).toBe(false);
    const handler = vscodeMock.registeredCommands.get('speckit.runChatQuickAction');

    expect(handler).toBeTypeOf('function');

    await handler?.('  @speckit /status  ');

    expect(vscodeMock.executeCommand).toHaveBeenCalledWith('workbench.action.chat.open', {
      query: '@speckit /status',
    });
    expect(vscodeMock.showWarningMessage).not.toHaveBeenCalled();
  });

  it('registers graph navigation commands', () => {
    const context = { subscriptions: [] } as never;

    activate(context);

    expect(vscodeMock.registeredCommands.has('speckit.graph.rebuild')).toBe(true);
    expect(vscodeMock.registeredCommands.has('speckit.graph.show')).toBe(true);
    expect(vscodeMock.registeredCommands.has('speckit.graph.inspect')).toBe(true);
    expect(vscodeMock.registeredCommands.has('speckit.graph.installGuardrails')).toBe(true);
  });

  it('rejects invalid quick action queries', async () => {
    const context = { subscriptions: [] } as never;

    activate(context);

    const handler = vscodeMock.registeredCommands.get('speckit.runChatQuickAction');

    await handler?.('   ');

    expect(vscodeMock.executeCommand).not.toHaveBeenCalled();
    expect(vscodeMock.showErrorMessage).toHaveBeenCalledWith(
      'SpecKit: Não foi possível executar a ação rápida (query inválida).',
    );
  });

  it('rejects non-speckit quick action commands', async () => {
    const context = { subscriptions: [] } as never;
    activate(context);

    const handler = vscodeMock.registeredCommands.get('speckit.runChatQuickAction');
    await handler?.('@other /status');

    expect(vscodeMock.executeCommand).not.toHaveBeenCalled();
    expect(vscodeMock.showErrorMessage).toHaveBeenCalledWith(
      'SpecKit: Ação rápida bloqueada por política de segurança (comando não permitido).',
    );
  });

  it('requires explicit confirmation for high-risk quick actions', async () => {
    const context = { subscriptions: [] } as never;
    activate(context);

    const handler = vscodeMock.registeredCommands.get('speckit.runChatQuickAction');
    await handler?.('@speckit /commit');

    expect(vscodeMock.showWarningMessage).toHaveBeenCalled();
    expect(vscodeMock.executeCommand).toHaveBeenCalledWith('workbench.action.chat.open', {
      query: '@speckit /commit',
    });
  });

  it('does not execute sensitive quick action when confirmation is denied', async () => {
    const context = { subscriptions: [] } as never;
    activate(context);
    vscodeMock.showWarningMessage.mockResolvedValueOnce('Cancelar');

    const handler = vscodeMock.registeredCommands.get('speckit.runChatQuickAction');
    await handler?.('@speckit /commit');

    expect(vscodeMock.showWarningMessage).toHaveBeenCalled();
    expect(vscodeMock.executeCommand).not.toHaveBeenCalled();
  });

  it('blocks quick action payloads with multiline/backtick injection', async () => {
    const context = { subscriptions: [] } as never;
    activate(context);

    const handler = vscodeMock.registeredCommands.get('speckit.runChatQuickAction');
    await handler?.('@speckit /status `bad`');

    expect(vscodeMock.executeCommand).not.toHaveBeenCalled();
    expect(vscodeMock.showErrorMessage).toHaveBeenCalledWith(
      'SpecKit: Ação rápida bloqueada por política de segurança (comando não permitido).',
    );
  });
});
