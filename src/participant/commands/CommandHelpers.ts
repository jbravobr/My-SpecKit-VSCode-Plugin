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

export interface ExplicitConfirmationNotice {
  intentId: string;
  confirmCommand: string;
  confirmEffect: string;
  noConfirmationEffect: string;
  ttlMinutes: number;
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
  const command: vscode.Command = {
    title,
    command: 'speckit.runChatQuickAction',
    arguments: [query],
  };

  if (typeof stream.button === 'function') {
    stream.button(command);
    return;
  }

  if (typeof stream.push === 'function') {
    stream.push(new vscode.ChatResponseCommandButtonPart(command));
  }
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

export function formatExplicitConfirmationNotice(details: ExplicitConfirmationNotice): string {
  return (
    `### 🔐 Confirmação explícita pelo usuário\n` +
    `- **Código de confirmação desta proposta:** \`${details.intentId}\`\n` +
    `- Intent-ID: \`${details.intentId}\` (mesmo código, usado para auditoria e rastreabilidade)\n` +
    `- **Para confirmar:** clique no botão do chat ou copie este comando: \`${details.confirmCommand}\`\n` +
    `- **Ao confirmar:** ${details.confirmEffect}\n` +
    `- **Sem confirmar:** ${details.noConfirmationEffect}\n` +
    `- **Validade:** expira em ${details.ttlMinutes} minutos; se expirar, gere uma nova proposta.\n`
  );
}

export function formatInvalidConfirmationNotice(
  intentId: string,
  regenerateCommand: string,
  subject: string,
): string {
  return (
    `❌ Código de confirmação inválido ou expirado: \`${intentId}\`.\n\n` +
    `Esse código só vale para a proposta original de ${subject} e pode ter expirado. ` +
    `Nada foi alterado.\n\n` +
    `Para continuar, gere uma nova proposta com \`${regenerateCommand}\` e confirme usando o novo código mostrado no chat.\n`
  );
}
