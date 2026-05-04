import * as vscode from 'vscode';
import { parseFix } from '../../fix/FixParser';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { extractSpecType } from '../../parser/BaseParser';
import { parseStory } from '../../story/StoryParser';
import { AuditLogger } from '../../workflow/AuditLogger';
import { emitCommandTelemetry } from '../../workflow/CommandTelemetry';
import { gitOps, IGitOps } from '../../workflow/GitOperations';
import { createCorrelationId } from '../../workflow/ObservabilityContext';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import { requireWorkspace } from './CommandHelpers';

interface ActiveSpecCommitContext {
  specType?: 'story' | 'fix';
  specId?: string;
  gate?: number;
}

async function resolveActiveSpecCommitContext(
  workspace: IWorkspace,
  fs: IFileSystem,
): Promise<ActiveSpecCommitContext> {
  const activeSpecPath = await workspace.getActiveSpecPath();
  if (!activeSpecPath) return {};

  try {
    const content = await fs.readFile(activeSpecPath);
    const specType = extractSpecType(content);

    if (specType === 'fix') {
      const fix = parseFix(content);
      return { specType: 'fix', specId: fix.metadata.id, gate: fix.metadata.gate };
    }

    const story = parseStory(content);
    return { specType: 'story', specId: story.metadata.id, gate: story.metadata.gate };
  } catch {
    return {};
  }
}

function deriveAutoCommitMessage(ctx: ActiveSpecCommitContext): string | undefined {
  if (!ctx.specId) return undefined;

  if (ctx.gate === 2) return `test(${ctx.specId}): validações do gate 2`;
  if (ctx.gate === 3) return `fix(${ctx.specId}): ajustes pós-revisão`;
  if (ctx.gate === 4) return `chore(${ctx.specId}): fechamento de spec`;

  if (ctx.specType === 'fix') return `fix(${ctx.specId}): implementação guiada`;
  if (ctx.specType === 'story') return `feat(${ctx.specId}): implementação guiada`;

  return `chore(${ctx.specId}): commit automático speckit`;
}

export async function handleCommitCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  workspace: IWorkspace = vscodeWorkspace,
  fs: IFileSystem = vscodeFileSystem,
  git: IGitOps = gitOps,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const commandExecutionId = createCorrelationId('exec');
  const audit = new AuditLogger(workspaceRoot, fs);
  const tracer = new TraceabilityManager(workspaceRoot, fs);
  const activeContext = await resolveActiveSpecCommitContext(workspace, fs);

  const telemetryBase = {
    workspaceRoot,
    fs,
    audit,
    tracer,
    commandExecutionId,
    specId: activeContext.specId ?? 'GLOBAL-COMMIT',
    specType: activeContext.specType ?? ('story' as const),
    gate: activeContext.gate,
    llmResponseReceived: true,
  };

  let message = request.prompt.trim();
  if (!message) {
    const autoMessage = deriveAutoCommitMessage(activeContext);
    if (!autoMessage) {
      await emitCommandTelemetry({
        ...telemetryBase,
        command: '/commit',
        outcome: '❌ commit bloqueado por ausência de mensagem',
        detail: 'Nenhuma spec ativa para derivar mensagem automática.',
      });

      stream.markdown(
        '❌ Forneça uma mensagem de commit.\n\n' +
          '**Exemplo:** `@speckit /commit refactor: extrair validação de gate`\n',
      );
      return;
    }

    message = autoMessage;
    await emitCommandTelemetry({
      ...telemetryBase,
      command: '/commit',
      outcome: 'ℹ️ mensagem automática aplicada',
      detail: message,
    });

    stream.markdown(`ℹ️ Mensagem não informada. Usando padrão automático: \`${message}\`.\n\n`);
  }

  try {
    const isRepository = await git.isRepository(workspaceRoot);
    if (!isRepository) {
      await git.init(workspaceRoot);
      stream.markdown('ℹ️ Repositório Git não encontrado. `git init` executado no workspace.\n\n');
    }

    const hasChanges = await git.hasChanges(workspaceRoot);
    if (!hasChanges) {
      await emitCommandTelemetry({
        ...telemetryBase,
        command: '/commit',
        outcome: '✅ nada para commitar — working tree limpa',
      });

      stream.markdown('✅ Nada para commitar — working tree limpa.\n');
      return;
    }

    const fullMessage = message.startsWith('speckit: ') ? message : `speckit: ${message}`;
    const output = await git.commit(workspaceRoot, fullMessage);

    await emitCommandTelemetry({
      ...telemetryBase,
      command: '/commit',
      outcome: `✅ Commit realizado — ${fullMessage}`,
      detail: output.trim().split('\n')[0],
      traceType: 'commit',
      traceDescription: 'git commit realizado',
      traceData: {
        commitMessage: fullMessage,
      },
    });

    stream.markdown(`✅ **Commit realizado:**\n\n\`\`\`\n${output.trim()}\n\`\`\`\n`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    await emitCommandTelemetry({
      ...telemetryBase,
      command: '/commit',
      outcome: '❌ erro ao executar git commit',
      detail: msg,
    });

    stream.markdown(`❌ **Erro ao executar git commit:** ${msg}\n`);
  }
}
