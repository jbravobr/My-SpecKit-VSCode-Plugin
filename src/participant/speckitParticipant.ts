import * as vscode from 'vscode';
import { vscodeFileSystem } from '../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../generator/utils/VscodeWorkspace';
import { AuditLogger } from '../workflow/AuditLogger';
import { handleAgentCommand } from './commands/agentCommand';
import { handleAuditCommand } from './commands/auditCommand';
import { handleBatchCommand } from './commands/batchCommand';
import { handleCommitCommand } from './commands/commitCommand';
import { handleContextCommand } from './commands/contextCommand';
import { handleDiffCommand } from './commands/diffCommand';
import { handleDoctorCommand } from './commands/doctorCommand';
import { handleDraftCommand } from './commands/draftCommand';
import { handleFixCommand } from './commands/fixCommand';
import { handleGateCommand } from './commands/gateCommand';
import { handleInitCommand } from './commands/initCommand';
import { handleNewCommand } from './commands/newCommand';
import { handleStatusCommand } from './commands/statusCommand';
import { handleTraceCommand } from './commands/traceCommand';
import { handleValidateCommand } from './commands/validateCommand';

export async function handleSpeckitRequest(
  request: vscode.ChatRequest,
  _chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const command = request.command ?? '';
  const workspaceRoot = vscodeWorkspace.getWorkspaceRoot();
  const audit = workspaceRoot ? new AuditLogger(workspaceRoot, vscodeFileSystem) : undefined;

  if (audit && command) {
    await audit.log('command', `/${command}`);
  }

  try {
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
      case 'agent':
        await handleAgentCommand(request, stream, token);
        break;
      case 'gate':
        await handleGateCommand(request, stream, token);
        break;
      case 'audit':
        await handleAuditCommand(request, stream, token);
        break;
      case 'trace':
        await handleTraceCommand(request, stream, token);
        break;
      case 'diff':
        await handleDiffCommand(request, stream, token);
        break;
      case 'commit':
        await handleCommitCommand(request, stream, token);
        break;
      case 'context':
        await handleContextCommand(request, stream, token);
        break;
      case 'doctor':
        await handleDoctorCommand(request, stream, token);
        break;
      case 'batch':
        await handleBatchCommand(request, stream, token);
        break;
      case 'init':
        await handleInitCommand(request, stream, token);
        break;
      default:
        stream.markdown(
          '**SpecKit** — Spec Driven Development\n\n' +
            'Comandos disponíveis:\n' +
            '- `/new` — Iniciar uma nova história SDD\n' +
            '- `/fix` — Iniciar um novo bug fix\n' +
            '- `/draft` — Rascunhar uma spec (story ou fix) a partir de texto livre\n' +
            '- `/validate` — Validar a spec ativa e gerar configuração Copilot\n' +
            '- `/status` — Ver todas as specs abertas (Stories e Fixes)\n' +
            '- `/agent` — Alternar modo do agente (debugger, refactor, implementador, revisor)\n' +
            '- `/gate` — Exibir regras de gate e validar transições\n' +
            '- `/audit` — Visualizar log de auditoria\n' +
            '- `/trace` — Visualizar rastreabilidade de specs\n' +
            '- `/diff` — Mostrar git diff no chat\n' +
            '- `/commit` — Auto-stage e commit com prefixo speckit:\n' +
            '- `/context` — Gerenciar arquivos de contexto\n' +
            '- `/doctor` — Diagnóstico de saúde do workspace\n' +
            '- `/batch` — Processar todas as specs em lote (validar + gerar config)\n' +
            '- `/init` — Inicializar workspace e consolidar specs em .speckit/\n',
        );
    }
    if (audit && command) {
      await audit.log('command', `/${command} — ok`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (audit && command) {
      await audit.log('command', `/${command} — error: ${msg}`);
    }
    throw err;
  }
}

export function registerSpeckitParticipant(context: vscode.ExtensionContext): void {
  const participant = vscode.chat.createChatParticipant('speckit.assistant', handleSpeckitRequest);
  participant.iconPath = new vscode.ThemeIcon('book');
  context.subscriptions.push(participant);
}
