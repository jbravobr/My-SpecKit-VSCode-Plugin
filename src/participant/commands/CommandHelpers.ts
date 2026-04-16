import * as vscode from 'vscode';
import type { IWorkspace } from '../../generator/utils/IWorkspace';

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
