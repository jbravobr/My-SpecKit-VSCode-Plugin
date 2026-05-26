import * as vscode from 'vscode';
import { parseFix } from '../../fix/FixParser';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { extractSpecType, parseMetaFields, RE_META_BLOCK } from '../../parser/BaseParser';
import { parseStory } from '../../story/StoryParser';
import { detectBreakingChange } from '../../workflow/DecisionDetector';
import { recordDecision } from '../../workflow/DecisionRecorder';
import { AuditLogger } from '../../workflow/AuditLogger';
import { emitCommandTelemetry } from '../../workflow/CommandTelemetry';
import { gitOps, IGitOps } from '../../workflow/GitOperations';
import { upsertMetadataFields } from '../../workflow/MetadataPatcher';
import { createCorrelationId } from '../../workflow/ObservabilityContext';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import { emitContextualCommands, emitQuickActions, requireWorkspace } from './CommandHelpers';

interface ActiveSpecCommitContext {
  activeSpecPath?: string;
  specType?: 'story' | 'fix';
  specId?: string;
  status?: string;
  gate?: number;
  breakingChangeMetadata?: string;
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
    const breakingChangeMetadata = readBreakingChangeMetadata(content);

    if (specType === 'fix') {
      const fix = parseFix(content);
      return {
        activeSpecPath,
        specType: 'fix',
        specId: fix.metadata.id,
        status: fix.metadata.status,
        gate: fix.metadata.gate,
        breakingChangeMetadata,
      };
    }

    const story = parseStory(content);
    return {
      activeSpecPath,
      specType: 'story',
      specId: story.metadata.id,
      status: story.metadata.status,
      gate: story.metadata.gate,
      breakingChangeMetadata,
    };
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

function readBreakingChangeMetadata(content: string): string | undefined {
  const metadataBlock = content.match(RE_META_BLOCK)?.[1];
  if (!metadataBlock) return undefined;

  const metadata = parseMetaFields(metadataBlock);
  const rawValue =
    metadata['breaking-change'] ??
    metadata['breaking_change'] ??
    metadata['breaking'] ??
    metadata['major-change'];
  const normalized = rawValue?.trim();
  if (!normalized) return undefined;
  if (['false', 'no', 'none', '0'].includes(normalized.toLowerCase())) return undefined;
  return normalized;
}

function scheduleDecisionRecording(
  workspaceRoot: string,
  fs: IFileSystem,
  specId: string | undefined,
  commitMessage: string,
  breakingChangeMetadata?: string,
): void {
  if (!specId || !breakingChangeMetadata) return;

  const decision = detectBreakingChange(
    `${commitMessage}\nBREAKING CHANGE: ${breakingChangeMetadata}`,
    specId,
  );
  if (!decision) return;

  void recordDecision({ workspaceRoot, fs, decision }).catch(() => {
    // Decision capture is informational and must never block the commit flow.
  });
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
      emitContextualCommands(stream, [
        { command: '@speckit /diff', description: 'inspecionar alterações pendentes' },
        {
          command: '@speckit /commit feat: descrição da mudança',
          description: 'informar mensagem manual',
        },
      ]);
      emitQuickActions(stream, [{ title: '🔎 Ver Diff Atual', query: '@speckit /diff' }]);
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
    emitQuickActions(stream, [{ title: '🔎 Ver Diff Atual', query: '@speckit /diff' }]);
  }

  try {
    if (
      activeContext.specType === 'story' &&
      activeContext.gate === 4 &&
      activeContext.status === 'ready-to-commit' &&
      activeContext.activeSpecPath
    ) {
      const activeSpecContent = await fs.readFile(activeContext.activeSpecPath);
      const patch = upsertMetadataFields(activeSpecContent, { status: 'done' });
      if (patch.changed) {
        await fs.writeFile(activeContext.activeSpecPath, patch.content);
        activeContext.status = 'done';
        stream.markdown(
          'ℹ️ STORY em Gate 4 finalizada para `done` e incluída no commit final.\n\n',
        );
      }
    }

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
      emitQuickActions(stream, [{ title: '📊 Ver Status das Specs', query: '@speckit /status' }]);
      return;
    }

    const fullMessage = message.startsWith('speckit: ') ? message : `speckit: ${message}`;
    const output = await git.commit(workspaceRoot, fullMessage);
    scheduleDecisionRecording(
      workspaceRoot,
      fs,
      activeContext.specId,
      fullMessage,
      activeContext.breakingChangeMetadata,
    );

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

    stream.markdown(`## ✅ Commit realizado\n\n\`\`\`\n${output.trim()}\n\`\`\`\n`);
    emitContextualCommands(stream, [
      { command: '@speckit /status --all', description: 'validar estágio atual das specs' },
      { command: '@speckit /trace', description: 'inspecionar rastreabilidade após commit' },
    ]);
    emitQuickActions(stream, [
      { title: '📦 Ver Status Completo (--all)', query: '@speckit /status --all' },
      { title: '🔗 Ver Trace', query: '@speckit /trace' },
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    await emitCommandTelemetry({
      ...telemetryBase,
      command: '/commit',
      outcome: '❌ erro ao executar git commit',
      detail: msg,
    });

    stream.markdown(`❌ **Erro ao executar git commit:** ${msg}\n`);
    emitContextualCommands(stream, [
      { command: '@speckit /diff --full', description: 'inspecionar detalhes do erro de commit' },
      { command: '@speckit /doctor', description: 'diagnosticar ambiente do workspace' },
    ]);
    emitQuickActions(stream, [{ title: '🔎 Ver Diff Completo', query: '@speckit /diff --full' }]);
  }
}
