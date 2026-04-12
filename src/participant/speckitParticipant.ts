import * as vscode from 'vscode';
import { handleDraftCommand } from './commands/draftCommand';
import { handleFixCommand } from './commands/fixCommand';
import { handleNewCommand } from './commands/newCommand';
import { handleStatusCommand } from './commands/statusCommand';
import { handleValidateCommand } from './commands/validateCommand';

export async function handleSpeckitRequest(
  request: vscode.ChatRequest,
  _chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const command = request.command ?? '';

  switch (command) {
    case 'new':
      await handleNewCommand(request, stream, token);
      break;
    case 'fix':
      await handleFixCommand(request, stream, token);
      break;
    case 'validate':
      await handleValidateCommand(request, stream, token);
      break;
    case 'status':
      await handleStatusCommand(request, stream, token);
      break;
    case 'draft':
      await handleDraftCommand(request, stream, token);
      break;
    default:
      stream.markdown(
        '**SpecKit** — Spec Driven Development\n\n' +
          'Comandos disponíveis:\n' +
          '- `/new` — Iniciar uma nova história SDD\n' +
          '- `/fix` — Iniciar um novo bug fix\n' +
          '- `/draft` — Rascunhar uma spec (story ou fix) a partir de texto livre\n' +
          '- `/validate` — Validar a spec ativa e gerar configuração Copilot\n' +
          '- `/status` — Ver todas as specs abertas (Stories e Fixes)\n',
      );
  }
}

export function registerSpeckitParticipant(context: vscode.ExtensionContext): void {
  const participant = vscode.chat.createChatParticipant('speckit.assistant', handleSpeckitRequest);
  participant.iconPath = new vscode.ThemeIcon('book');
  context.subscriptions.push(participant);
}
