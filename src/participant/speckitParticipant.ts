import * as vscode from 'vscode';
import { handleNewCommand } from './commands/newCommand';
import { handleValidateCommand } from './commands/validateCommand';
import { handleApplyCommand } from './commands/applyCommand';
import { handleReviewCommand } from './commands/reviewCommand';
import { handleStatusCommand } from './commands/statusCommand';

export function registerSpeckitParticipant(context: vscode.ExtensionContext): void {
  const participant = vscode.chat.createChatParticipant(
    'speckit.assistant',
    async (
      request: vscode.ChatRequest,
      chatContext: vscode.ChatContext,
      stream: vscode.ChatResponseStream,
      token: vscode.CancellationToken,
    ) => {
      const command = request.command ?? '';

      switch (command) {
        case 'new':
          await handleNewCommand(request, stream, token);
          break;
        case 'validate':
          await handleValidateCommand(request, stream, token);
          break;
        case 'apply':
          await handleApplyCommand(request, stream, token);
          break;
        case 'review':
          await handleReviewCommand(request, stream, token);
          break;
        case 'status':
          await handleStatusCommand(request, stream, token);
          break;
        default:
          stream.markdown(
            '**SpecKit** — Spec Driven Development\n\n' +
            'Comandos disponíveis:\n' +
            '- `/new` — Iniciar uma nova história SDD\n' +
            '- `/validate` — Validar DoR e iniciar implementação\n' +
            '- `/apply` — Gerar configuração Copilot e iniciar implementação\n' +
            '- `/review` — Iniciar revisão independente (após implementação + testes)\n' +
            '- `/status` — Ver estado da história atual\n',
          );
      }
    },
  );

  participant.iconPath = new vscode.ThemeIcon('book');
  context.subscriptions.push(participant);
}
