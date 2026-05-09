import * as vscode from 'vscode';
import type { IWorkspace } from '../../generator/utils/IWorkspace';

export interface ContextualCommand {
  command: string;
  description: string;
}

export interface ChatQuickAction {
  title: string;
  query: string;
}

/**
 * Validates workspace is open and returns the root path.
 * Emits a standardized error message to the chat stream if no workspace is open.
 * @returns workspaceRoot or `undefined` if missing (caller should return early)
 */
export function requireWorkspace(
  workspace: IWorkspace,
  stream: vscode.ChatResponseStream,
): string | undefined {
  const root = workspace.getWorkspaceRoot();
  if (!root) {
    stream.markdown('❌ Nenhum workspace aberto. Abra uma pasta antes de usar o SpecKit.');
  }
  return root;
}

/**
 * Formats an unknown error and emits it to the chat stream.
 * Standardizes the pattern: `err instanceof Error ? err.message : String(err)`.
 */
export function handleCommandError(
  err: unknown,
  stream: vscode.ChatResponseStream,
  context: string,
): void {
  const msg = err instanceof Error ? err.message : String(err);
  stream.markdown(`❌ **${context}:** ${msg}\n`);
}

export function emitChatQuickActionButton(
  stream: vscode.ChatResponseStream,
  title: string,
  query: string,
): void {
  if (typeof stream.button !== 'function') return;
  stream.button({
    title,
    command: 'speckit.openChatWithQuery',
    arguments: [query],
  });
}

export function emitContextualCommands(
  stream: vscode.ChatResponseStream,
  commands: ContextualCommand[],
  note?: string,
): void {
  if (commands.length === 0) return;
  const lines = commands.map((item) => `- \`${item.command}\` (${item.description})`).join('\n');
  stream.markdown(
    '### Comandos disponíveis agora (contextuais)\n' + `${lines}\n` + (note ? `\n> ${note}\n` : ''),
  );
}

export function emitQuickActions(
  stream: vscode.ChatResponseStream,
  actions: ChatQuickAction[],
): void {
  for (const action of actions) {
    emitChatQuickActionButton(stream, action.title, action.query);
  }
}
