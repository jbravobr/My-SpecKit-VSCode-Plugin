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
import { handleHelpCommand } from './commands/helpCommand';
import { handleHistoryCommand } from './commands/historyCommand';
import { handleInitCommand } from './commands/initCommand';
import { handleNewCommand } from './commands/newCommand';
import { handleReviewAutoCommand } from './commands/reviewAutoCommand';
import { handleStatusCommand } from './commands/statusCommand';
import { handleTraceCommand } from './commands/traceCommand';
import { handleValidateCommand } from './commands/validateCommand';

const LLM_HISTORY_COMMANDS = new Set<string>([
  'new',
  'fix',
  'draft',
  'batch',
  'validate',
  'review-auto',
]);

function withPrompt(request: vscode.ChatRequest, prompt: string): vscode.ChatRequest {
  return {
    ...request,
    prompt,
  };
}

function appendFlags(prompt: string | undefined, flags: string[]): string {
  const baseTokens = (prompt ?? '').trim().split(/\s+/).filter(Boolean);
  const tokenSet = new Set(baseTokens.map((token) => token.toLowerCase()));
  for (const flag of flags) {
    if (!tokenSet.has(flag.toLowerCase())) {
      baseTokens.push(flag);
    }
  }
  return baseTokens.join(' ');
}

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
      case 'status-all':
        await handleStatusCommand(
          withPrompt(request, appendFlags(request.prompt, ['--all'])),
          stream,
          token,
        );
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
      case 'history':
        await handleHistoryCommand(request, stream, token);
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
      case 'batch-generate':
        await handleBatchCommand(
          withPrompt(request, appendFlags(request.prompt, ['--generate'])),
          stream,
          token,
        );
        break;
      case 'batch-unified':
        await handleBatchCommand(
          withPrompt(request, appendFlags(request.prompt, ['--generate', '--unified'])),
          stream,
          token,
        );
        break;
      case 'help':
        await handleHelpCommand(request, stream, token);
        break;
      case 'help-status':
        await handleHelpCommand(withPrompt(request, 'status'), stream, token);
        break;
      case 'init':
        await handleInitCommand(request, stream, token);
        break;
      case 'review-auto':
        await handleReviewAutoCommand(request, stream, token);
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
            '- `/status-all` — Atalho para `/status --all`\n' +
            '- `/agent` — Alternar modo do agente (debugger, refactor, implementador, revisor)\n' +
            '- `/gate` — Exibir regras de gate e validar transições\n' +
            '- `/audit` — Visualizar log de auditoria\n' +
            '- `/trace` — Visualizar rastreabilidade de specs\n' +
            '- `/history` — Visualizar histórico agregado (audit, trace e log)\n' +
            '- `/diff` — Mostrar git diff no chat\n' +
            '- `/commit` — Auto-stage e commit com prefixo speckit:\n' +
            '- `/context` — Gerenciar arquivos de contexto\n' +
            '- `/doctor` — Diagnóstico de saúde do workspace\n' +
            '- `/batch` — Processar todas as specs em lote (validar + gerar config)\n' +
            '- `/batch-generate` — Atalho para `/batch --generate`\n' +
            '- `/batch-unified` — Atalho para `/batch --generate --unified`\n' +
            '- `/help` — Ajuda rápida de comandos e parâmetros\n' +
            '- `/help-status` — Atalho para `/help status`\n' +
            '- `/review-auto` — Orquestrar transição para Gate 3 e executar revisão automática\n' +
            '- `/init` — Inicializar workspace e consolidar specs em .speckit/\n',
        );
    }

    if (audit && command && LLM_HISTORY_COMMANDS.has(command)) {
      await audit.log('tool_call', 'llm_response_received', {
        command: `/${command}`,
        llmResponseReceived: true,
      });
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
