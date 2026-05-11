import * as vscode from 'vscode';
import { describe, expect, it, vi } from 'vitest';
import { emitChatQuickActionButton } from '../../../src/participant/commands/CommandHelpers';

describe('emitChatQuickActionButton', () => {
  it('falls back to push command button part when stream.button is unavailable', () => {
    const pushMock = vi.fn();
    const vscodeWithCtor = vscode as unknown as {
      ChatResponseCommandButtonPart?: new (value: vscode.Command) => { value: vscode.Command };
    };
    const originalCtor = vscodeWithCtor.ChatResponseCommandButtonPart;
    class FakeChatResponseCommandButtonPart {
      constructor(public readonly value: vscode.Command) {}
    }
    Object.defineProperty(vscodeWithCtor, 'ChatResponseCommandButtonPart', {
      value: FakeChatResponseCommandButtonPart,
      configurable: true,
    });

    const stream = {
      markdown: vi.fn(),
      anchor: vi.fn(),
      button: undefined,
      filetree: vi.fn(),
      progress: vi.fn(),
      reference: vi.fn(),
      push: pushMock,
    } as unknown as vscode.ChatResponseStream;

    try {
      emitChatQuickActionButton(stream, '✅ Confirmar', '@speckit /review-auto --confirm 123');
    } finally {
      Object.defineProperty(vscodeWithCtor, 'ChatResponseCommandButtonPart', {
        value: originalCtor,
        configurable: true,
      });
    }

    expect(pushMock).toHaveBeenCalledTimes(1);
    const buttonPart = pushMock.mock.calls[0]?.[0];
    expect(buttonPart).toBeInstanceOf(FakeChatResponseCommandButtonPart);
    expect(buttonPart.value.title).toBe('✅ Confirmar');
    expect(buttonPart.value.command).toBe('speckit.runChatQuickAction');
    expect(buttonPart.value.arguments).toEqual(['@speckit /review-auto --confirm 123']);
  });
});
