import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscodeMock = vi.hoisted(() => {
  const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

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
    onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  };
});

vi.mock('vscode', () => ({
  commands: {
    registerCommand: vscodeMock.registerCommand,
    executeCommand: vscodeMock.executeCommand,
  },
  workspace: {
    onDidSaveTextDocument: vscodeMock.onDidSaveTextDocument,
  },
  window: {
    showErrorMessage: vscodeMock.showErrorMessage,
    showInformationMessage: vscodeMock.showInformationMessage,
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
    vscodeMock.onDidSaveTextDocument.mockClear();
  });

  it('registers and executes the dedicated quick action command', async () => {
    const context = { subscriptions: [] } as never;

    activate(context);

    const handler = vscodeMock.registeredCommands.get('speckit.runChatQuickAction');

    expect(handler).toBeTypeOf('function');

    await handler?.('  @speckit /status  ');

    expect(vscodeMock.executeCommand).toHaveBeenCalledWith('workbench.action.chat.open', {
      query: '@speckit /status',
    });
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
});
