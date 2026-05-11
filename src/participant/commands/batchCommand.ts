import * as path from 'path';
import * as vscode from 'vscode';
import { parseFix } from '../../fix/FixParser';
import { validateFix } from '../../fix/FixValidator';
import { generateCopilotConfig } from '../../generator/CopilotConfigGenerator';
import { generateFixCopilotConfig } from '../../generator/FixCopilotConfigGenerator';
import { generateUnifiedAgent } from '../../generator/agent/StoryUnifiedAgentGenerator';
import { generateBatchIndex } from '../../generator/story/BatchIndexGenerator';
import { backupCopilotInstructions } from '../../generator/utils/BackupManager';
import {
  BatchBranchRuntimeContext,
  detectBatchBranchMentions,
  generateBatchBranchGovernanceSummary,
  generateBatchBranchModeMessage,
} from '../../generator/utils/BranchGovernance';
import { analyzeDependencies } from '../../generator/utils/DependencyGraph';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { extractSpecType } from '../../parser/BaseParser';
import type { Gate, Story } from '../../story/Story';
import { parseStory } from '../../story/StoryParser';
import { validateStory } from '../../story/StoryValidator';
import { AuditLogger } from '../../workflow/AuditLogger';
import { emitCommandTelemetry } from '../../workflow/CommandTelemetry';
import { createCorrelationId } from '../../workflow/ObservabilityContext';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import {
  BranchResolutionStrategy,
  clearBranchSessionGovernance,
  consumeTransitionIntent,
  createTransitionIntent,
  getBranchSessionGovernance,
  setBranchSessionGovernance,
} from '../../workflow/TransitionGovernance';
import { gitOps, IGitOps } from '../../workflow/GitOperations';
import { requireWorkspace } from './CommandHelpers';

const GATE_LABELS: Record<Gate, string> = {
  0: 'Alinhamento',
  1: 'Implementação',
  2: 'Testes',
  3: 'Revisão',
  4: 'Entrega',
};

interface SpecEntry {
  fileName: string;
  specType: 'story' | 'fix';
  valid: boolean;
  gapCount: number;
  title: string;
  id: string;
  gate: Gate;
  status: string;
  language?: string;
  framework?: string;
  error?: string;
}

interface BatchCommandControl {
  flags: string[];
  invalidFlags: string[];
  generateConfigs: boolean;
  useUnified: boolean;
  storyId?: string;
  branchStrategy?: BranchResolutionStrategy;
  branchStrategyRaw?: string;
  confirmIntentId?: string;
}

function emitChatQuickActionButton(
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

function readFlagValue(tokens: string[], flag: string): string | undefined {
  const normalized = flag.toLowerCase();
  for (let idx = 0; idx < tokens.length; idx += 1) {
    const token = tokens[idx];
    const lowered = token.toLowerCase();

    if (lowered === normalized) {
      const next = tokens[idx + 1];
      if (next && !next.startsWith('--')) return next.trim();
      return undefined;
    }

    if (lowered.startsWith(`${normalized}=`)) {
      return token.slice(normalized.length + 1).trim();
    }
  }
  return undefined;
}

function parseBranchStrategy(value: string | undefined): BranchResolutionStrategy | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'session' || normalized === 'cited') return normalized;
  return undefined;
}

function parseBatchControl(prompt: string | undefined): BatchCommandControl {
  const tokens = (prompt ?? '').trim().split(/\s+/).filter(Boolean);
  const normalizedTokens = tokens.map((token) => token.toLowerCase());
  const flags = normalizedTokens
    .filter((token) => token.startsWith('--'))
    .map((token) => token.split('=')[0]);

  const allowedFlags = new Set([
    '--generate',
    '--gen',
    '--unified',
    '--story',
    '--branch-strategy',
    '--confirm',
  ]);
  const invalidFlags = flags.filter((flag) => !allowedFlags.has(flag));

  const generateConfigs =
    normalizedTokens.includes('--generate') || normalizedTokens.includes('--gen');
  const useUnified = normalizedTokens.includes('--unified');
  const storyId = readFlagValue(tokens, '--story');
  const branchStrategyRaw = readFlagValue(tokens, '--branch-strategy');
  const confirmIntentId = readFlagValue(tokens, '--confirm');

  return {
    flags,
    invalidFlags,
    generateConfigs,
    useUnified,
    storyId: storyId && storyId.length > 0 ? storyId : undefined,
    branchStrategyRaw,
    branchStrategy: parseBranchStrategy(branchStrategyRaw),
    confirmIntentId: confirmIntentId && confirmIntentId.length > 0 ? confirmIntentId : undefined,
  };
}

function appendBatchBranchFlags(
  commandLabel: string,
  branchStrategy: BranchResolutionStrategy,
  confirmIntentId?: string,
): string {
  return `@speckit ${commandLabel} --branch-strategy ${branchStrategy}${confirmIntentId ? ` --confirm ${confirmIntentId}` : ''}`;
}

function buildSuggestedBatchBranchName(workspaceRoot: string): string {
  const now = new Date();
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const workspaceSlug =
    path
      .basename(workspaceRoot)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'workspace';
  return `feature/batch-${yyyymmdd}-${workspaceSlug}`;
}

function isMissingCurrentBranchError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const normalized = message.toLowerCase();
  return (
    normalized.includes('head indefinido') ||
    normalized.includes('detached') ||
    normalized.includes('branch atual')
  );
}

function sameMentionSet(left: string[], right: string[]): boolean {
  const normalize = (values: string[]): string[] =>
    [...values].map((value) => value.toLowerCase()).sort((a, b) => a.localeCompare(b));
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

async function resolveBatchBranchRuntimeContext(
  stories: Story[],
  workspaceRoot: string,
  stream: vscode.ChatResponseStream,
  fs: IFileSystem,
  git: IGitOps,
  commandLabel: string,
  control: BatchCommandControl,
  audit: AuditLogger,
  tracer: TraceabilityManager,
  commandExecutionId: string,
  batchId: string,
): Promise<BatchBranchRuntimeContext | undefined> {
  const citedMentions = detectBatchBranchMentions(stories);
  if (citedMentions.length === 0) return undefined;

  const persistedGovernance =
    control.branchStrategy || control.confirmIntentId
      ? undefined
      : await getBranchSessionGovernance(workspaceRoot, fs);

  if (persistedGovernance) {
    if (
      persistedGovernance.strategy === 'cited' &&
      !sameMentionSet(persistedGovernance.citedMentions, citedMentions)
    ) {
      await clearBranchSessionGovernance(workspaceRoot, fs);
      stream.markdown(
        '\n♻️ A governança de branch citada da sessão foi resetada porque o novo lote cita branches diferentes das confirmadas anteriormente.\n\n',
      );
    } else if (
      persistedGovernance.strategy === 'session' &&
      persistedGovernance.sessionBranch &&
      git.currentBranch
    ) {
      try {
        const currentBranch = await git.currentBranch(workspaceRoot);
        if (currentBranch !== persistedGovernance.sessionBranch) {
          await clearBranchSessionGovernance(workspaceRoot, fs);
          stream.markdown(
            `\n♻️ A governança de branch da sessão foi resetada porque a branch ativa atual (\`${currentBranch}\`) difere da branch canônica previamente confirmada (\`${persistedGovernance.sessionBranch}\`).\n\n`,
          );
        }
      } catch (err: unknown) {
        if (isMissingCurrentBranchError(err)) {
          await clearBranchSessionGovernance(workspaceRoot, fs);
          stream.markdown(
            '\n♻️ A governança de branch da sessão foi resetada porque a branch ativa do Git não pôde mais ser resolvida.\n\n',
          );
        } else {
          throw err;
        }
      }
    }
  }

  const reusableGovernance =
    control.branchStrategy || control.confirmIntentId
      ? undefined
      : await getBranchSessionGovernance(workspaceRoot, fs);

  if (reusableGovernance) {
    const context: BatchBranchRuntimeContext = {
      strategy: reusableGovernance.strategy,
      citedMentions,
      sessionBranch: reusableGovernance.sessionBranch,
      sessionBranchSource: reusableGovernance.sessionBranchSource,
    };

    stream.markdown(
      `\n♻️ Reutilizando governança de branch da sessão: ${generateBatchBranchModeMessage(context)}\n\n`,
    );
    return context;
  }

  if (!control.branchStrategy) {
    stream.markdown(
      `\n### 🌿 Governança de branch citada (obrigatória antes da geração unificada)\n\n` +
        `As stories deste lote citam ${citedMentions.map((mention) => `\`${mention}\``).join(', ')}.\n\n` +
        `Antes de gerar os agentes, o usuário precisa decidir se o lote deve:\n` +
        `1. respeitar as branch(es) citada(s), ou\n` +
        `2. usar sempre a branch carregada na sessão do VS Code como fonte canônica.\n`,
    );
    emitChatQuickActionButton(
      stream,
      '🌿 Usar branch da sessão',
      appendBatchBranchFlags(commandLabel, 'session'),
    );
    emitChatQuickActionButton(
      stream,
      '🧭 Respeitar branch(es) citadas',
      appendBatchBranchFlags(commandLabel, 'cited'),
    );
    return undefined;
  }

  if (control.branchStrategy === 'cited') {
    const governance = await setBranchSessionGovernance(workspaceRoot, fs, {
      strategy: 'cited',
      command: commandLabel,
      citedMentions,
    });
    const context: BatchBranchRuntimeContext = {
      strategy: governance.strategy,
      citedMentions,
    };
    stream.markdown(`\n✅ ${generateBatchBranchModeMessage(context)}\n\n`);
    await emitCommandTelemetry({
      workspaceRoot,
      fs,
      audit,
      tracer,
      command: commandLabel,
      outcome: `🌿 estratégia de branch resolvida: respeitar branches citadas (${citedMentions.join(', ')})`,
      commandExecutionId,
      batchId,
      specId: 'GLOBAL-BATCH',
      specTitle: 'Batch Command',
      specType: 'story',
      llmResponseReceived: true,
      traceDescription: 'batch branch governance resolved',
    });
    return context;
  }

  if (!(await git.isRepository(workspaceRoot))) {
    stream.markdown(
      '\n❌ Não foi possível aplicar a estratégia `session`: o workspace atual não está em um repositório Git.\n',
    );
    return undefined;
  }

  if (control.confirmIntentId) {
    const intent = await consumeTransitionIntent(
      workspaceRoot,
      fs,
      control.confirmIntentId,
      'branch-governance',
    );
    if (!intent || intent.payload.action !== 'create-session-branch') {
      stream.markdown(
        `\n❌ Intent-ID inválido ou expirado: \`${control.confirmIntentId}\`. Gere uma nova sugestão com \`${appendBatchBranchFlags(commandLabel, 'session')}\`.\n`,
      );
      emitChatQuickActionButton(
        stream,
        '🌿 Gerar nova sugestão de branch',
        appendBatchBranchFlags(commandLabel, 'session'),
      );
      return undefined;
    }

    const branchName = intent.payload.branchName;
    if (!branchName) {
      stream.markdown(
        '\n❌ O intent de branch não contém o nome da branch sugerida. Gere uma nova sugestão para continuar.\n',
      );
      emitChatQuickActionButton(
        stream,
        '🌿 Gerar nova sugestão de branch',
        appendBatchBranchFlags(commandLabel, 'session'),
      );
      return undefined;
    }

    if (!git.createBranch) {
      stream.markdown(
        '\n❌ O runtime Git configurado não suporta criação de branch neste fluxo.\n',
      );
      return undefined;
    }

    try {
      await git.createBranch(workspaceRoot, branchName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      stream.markdown(
        `\n❌ Não foi possível criar a branch sugerida \`${branchName}\`: ${message}\n`,
      );
      return undefined;
    }

    const governance = await setBranchSessionGovernance(workspaceRoot, fs, {
      strategy: 'session',
      command: commandLabel,
      citedMentions,
      sessionBranch: branchName,
      sessionBranchSource: 'created',
    });
    const context: BatchBranchRuntimeContext = {
      strategy: governance.strategy,
      citedMentions,
      sessionBranch: governance.sessionBranch,
      sessionBranchSource: governance.sessionBranchSource,
    };
    stream.markdown(`\n✅ Branch da sessão criada e fixada para este lote: \`${branchName}\`.\n\n`);
    await emitCommandTelemetry({
      workspaceRoot,
      fs,
      audit,
      tracer,
      command: commandLabel,
      outcome: `🌿 branch da sessão criada e fixada: ${branchName}`,
      commandExecutionId,
      batchId,
      specId: 'GLOBAL-BATCH',
      specTitle: 'Batch Command',
      specType: 'story',
      llmResponseReceived: true,
      traceDescription: 'batch branch governance resolved',
    });
    return context;
  }

  if (!git.currentBranch) {
    stream.markdown(
      '\n❌ O runtime Git configurado não suporta leitura da branch atual neste fluxo.\n',
    );
    return undefined;
  }

  try {
    const currentBranch = await git.currentBranch(workspaceRoot);
    const governance = await setBranchSessionGovernance(workspaceRoot, fs, {
      strategy: 'session',
      command: commandLabel,
      citedMentions,
      sessionBranch: currentBranch,
      sessionBranchSource: 'current',
    });
    const context: BatchBranchRuntimeContext = {
      strategy: governance.strategy,
      citedMentions,
      sessionBranch: governance.sessionBranch,
      sessionBranchSource: governance.sessionBranchSource,
    };
    stream.markdown(`\n✅ ${generateBatchBranchModeMessage(context)}\n\n`);
    await emitCommandTelemetry({
      workspaceRoot,
      fs,
      audit,
      tracer,
      command: commandLabel,
      outcome: `🌿 estratégia de branch resolvida: branch da sessão ${currentBranch}`,
      commandExecutionId,
      batchId,
      specId: 'GLOBAL-BATCH',
      specTitle: 'Batch Command',
      specType: 'story',
      llmResponseReceived: true,
      traceDescription: 'batch branch governance resolved',
    });
    return context;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isMissingCurrentBranchError(err)) {
      stream.markdown(`\n❌ Não foi possível resolver a branch atual da sessão: ${message}\n`);
      return undefined;
    }

    const suggestedBranch = buildSuggestedBatchBranchName(workspaceRoot);
    const intent = await createTransitionIntent(workspaceRoot, fs, {
      kind: 'branch-governance',
      command: commandLabel,
      payload: {
        action: 'create-session-branch',
        branchName: suggestedBranch,
        strategy: 'session',
      },
      ttlMinutes: 240,
    });

    stream.markdown(
      `\n### 🌿 Criação de branch da sessão (confirmação obrigatória)\n\n` +
        `A estratégia \`session\` foi escolhida, mas nenhuma branch ativa pôde ser resolvida no Git (${message}).\n\n` +
        `Sugestão de branch para este lote: \`${suggestedBranch}\`\n\n` +
        `Intent-ID: \`${intent.id}\`\n` +
        `Confirme explicitamente para criar e fixar essa branch na sessão:\n` +
        `- \`${appendBatchBranchFlags(commandLabel, 'session', intent.id)}\`\n`,
    );
    emitChatQuickActionButton(
      stream,
      '✅ Confirmar criação da branch sugerida',
      appendBatchBranchFlags(commandLabel, 'session', intent.id),
    );
    return undefined;
  }
}

export async function handleBatchCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
  git: IGitOps = gitOps,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const prompt = request.prompt ?? '';
  const control = parseBatchControl(prompt);

  if (control.invalidFlags.length > 0) {
    stream.markdown(
      `❌ Parâmetro(s) inválido(s) em /batch: ${control.invalidFlags.map((flag) => `\`${flag}\``).join(', ')}\n\n` +
        '**Uso:** `@speckit /batch [--generate|--gen] [--unified] [--story <id>] [--branch-strategy <session|cited>] [--confirm <intent-id>]`\n' +
        'Dica: para modo unificado, use `@speckit /batch --generate --unified`.',
    );
    return;
  }

  if (control.flags.includes('--confirm') && !control.confirmIntentId) {
    stream.markdown(
      '❌ Use `--confirm <intent-id>` para confirmar uma criação pendente de branch da sessão.\n',
    );
    return;
  }

  if (control.flags.includes('--branch-strategy') && !control.branchStrategyRaw) {
    stream.markdown(
      '❌ Use `--branch-strategy <session|cited>` para escolher a estratégia de branch do lote.\n',
    );
    return;
  }

  if (control.branchStrategyRaw && !control.branchStrategy) {
    stream.markdown(
      `❌ Estratégia de branch inválida: \`${control.branchStrategyRaw}\`. Use apenas \`session\` ou \`cited\`.\n`,
    );
    return;
  }

  if (control.flags.includes('--story') && !control.storyId) {
    stream.markdown(
      '❌ Use `--story <id>` para filtrar uma story específica no modo unificado.\n\n' +
        '**Exemplo de uso:** `@speckit /batch --generate --unified --story <id>`',
    );
    return;
  }

  if (
    (control.branchStrategy || control.confirmIntentId) &&
    !(control.generateConfigs && control.useUnified)
  ) {
    stream.markdown(
      '❌ `--branch-strategy` e `--confirm` só podem ser usados com `--generate --unified`.\n\n' +
        '**Exemplo de uso:** `@speckit /batch --generate --unified --branch-strategy session`',
    );
    return;
  }

  if (control.confirmIntentId && control.branchStrategy !== 'session') {
    stream.markdown(
      '❌ `--confirm <intent-id>` exige `--branch-strategy session`, pois essa confirmação só é usada para criar a branch da sessão.\n',
    );
    return;
  }

  if (control.storyId && !(control.generateConfigs && control.useUnified)) {
    stream.markdown(
      '❌ A flag `--story` só pode ser usada com `--generate --unified`.\n\n' +
        '**Exemplo de uso:** `@speckit /batch --generate --unified --story <id>`',
    );
    return;
  }

  const commandExecutionId = createCorrelationId('exec');
  const batchId = createCorrelationId('batch');
  const audit = new AuditLogger(workspaceRoot, fs);
  const tracer = new TraceabilityManager(workspaceRoot, fs);

  const specDir = path.join(workspaceRoot, '.speckit');

  const [storyFiles, fixFiles] = await Promise.all([
    workspace.listStoryFiles(specDir),
    workspace.listFixFiles(specDir),
  ]);

  const allFiles = [
    ...storyFiles.map((f) => ({ name: f, hint: 'story' as const })),
    ...fixFiles.map((f) => ({ name: f, hint: 'fix' as const })),
  ];

  if (allFiles.length === 0) {
    stream.markdown(
      '❌ Nenhuma spec encontrada em `.speckit/`. Use `/new` ou `/fix` para criar specs.',
    );
    return;
  }

  stream.markdown(`⏳ Processando **${allFiles.length}** spec(s) em paralelo...\n\n`);

  const { generateConfigs, useUnified, storyId } = control;
  const phaseCommand = resolveBatchCommandLabel(generateConfigs, useUnified, storyId);

  // Phase 1: Parse + Validate all specs in parallel (read-only, safe)
  const allEntries = await Promise.all(
    allFiles.map(({ name, hint }) => processSpec(name, hint, specDir, fs)),
  );

  const entries = storyId
    ? allEntries.filter(
        (entry) => entry.specType === 'story' && entry.id.toLowerCase() === storyId.toLowerCase(),
      )
    : allEntries;

  if (storyId && entries.length === 0) {
    const availableStories = allEntries
      .filter((entry) => entry.specType === 'story')
      .map((entry) => `\`${entry.id}\``);
    stream.markdown(
      `❌ Story \`${storyId}\` não encontrada no lote atual.\n` +
        (availableStories.length > 0
          ? `\nStories disponíveis: ${availableStories.join(', ')}\n`
          : '\nNenhuma story encontrada em `.speckit/`.\n'),
    );
    return;
  }

  const valid = entries.filter((e) => e.valid && !isTerminal(e.status));
  const invalid = entries.filter((e) => !e.valid && !e.error && !isTerminal(e.status));
  const errored = entries.filter((e) => !!e.error);
  const skipped = entries.filter((e) => isTerminal(e.status));

  await recordBatchPhaseEvents(
    entries,
    phaseCommand,
    workspaceRoot,
    fs,
    audit,
    tracer,
    commandExecutionId,
    batchId,
  );

  // Phase 2: Report validation summary
  emitSummary(stream, entries, valid, invalid, errored, skipped);
  if (storyId) {
    stream.markdown(`\n🎯 Filtro aplicado: somente story \`${storyId}\`.\n`);
  }

  if (!generateConfigs) {
    stream.markdown(
      '\n---\n\n' +
        '💡 **O que fazer agora?**\n\n' +
        '- **Trabalhando em uma story ou fix individual:** use `@speckit /validate` para validar a spec ativa e iniciar o ciclo de implementação.\n' +
        '- **Tem um backlog completo de stories já escritas:** use `@speckit /batch --generate --unified` para gerar agentes para todas em lote.\n' +
        '- **Refactoring ou debug sem spec:** inicie um agente diretamente no Copilot Chat, sem precisar de story.\n',
    );

    stream.markdown('\nAções rápidas:\n\n');
    emitChatQuickActionButton(
      stream,
      '🤖 Gerar Lote Unificado',
      '@speckit /batch --generate --unified',
    );
    emitChatQuickActionButton(stream, '📋 Validar Spec Ativa', '@speckit /validate');

    await emitCommandTelemetry({
      workspaceRoot,
      fs,
      audit,
      tracer,
      command: '/batch',
      outcome: `📊 ${valid.length} válida(s), ${invalid.length} inválida(s), ${errored.length} erro(s), ${skipped.length} finalizada(s)`,
      commandExecutionId,
      batchId,
      specId: 'GLOBAL-BATCH',
      specTitle: 'Batch Command',
      specType: 'story',
      llmResponseReceived: true,
      traceDescription: 'batch summary sem geração',
    });
    return;
  }

  if (valid.length === 0) {
    stream.markdown('\n⚠️ Nenhuma spec válida para gerar configuração.\n');
    return;
  }

  if (useUnified) {
    const unifiedGenerated = await handleUnifiedGenerate(
      valid,
      specDir,
      workspaceRoot,
      stream,
      fs,
      workspace,
      audit,
      tracer,
      git,
      commandExecutionId,
      batchId,
      phaseCommand,
      control,
    );
    if (!unifiedGenerated) return;
    await emitCommandTelemetry({
      workspaceRoot,
      fs,
      audit,
      tracer,
      command: phaseCommand,
      outcome: `Agentes unificados gerados para ${valid.length} spec(s)`,
      commandExecutionId,
      batchId,
      specId: 'GLOBAL-BATCH',
      specTitle: 'Batch Command',
      specType: 'story',
      llmResponseReceived: true,
      traceDescription: 'batch summary unificado',
    });
    return;
  }

  // Phase 3: Generate configs sequentially (they share .github/ namespace)
  stream.markdown('\n---\n\n⏳ Gerando configuração Copilot para specs válidas...\n\n');

  const backupPath = await backupCopilotInstructions(workspaceRoot, fs);
  if (backupPath) {
    stream.markdown('💾 Backup do `copilot-instructions.md` anterior salvo.\n\n');
  }

  const generated: { id: string; files: string[] }[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const entry of valid) {
    try {
      const content = await fs.readFile(path.join(specDir, entry.fileName));
      let files: string[];

      if (entry.specType === 'story') {
        const story = parseStory(content);
        files = await generateCopilotConfig(workspaceRoot, story, fs);
      } else {
        const fix = parseFix(content);
        files = await generateFixCopilotConfig(workspaceRoot, fix, fs, workspace);
      }

      generated.push({ id: entry.id, files });

      await recordBatchGenerateEvent(
        entry,
        `✅ ${files.length} arquivo(s) gerado(s)`,
        workspaceRoot,
        fs,
        audit,
        tracer,
        commandExecutionId,
        batchId,
      );

      stream.markdown(`✅ \`${entry.id}\` — ${files.length} arquivo(s) gerado(s)\n`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ id: entry.id, error: msg });

      await recordBatchGenerateEvent(
        entry,
        `❌ erro na geração: ${msg}`,
        workspaceRoot,
        fs,
        audit,
        tracer,
        commandExecutionId,
        batchId,
      );

      stream.markdown(`❌ \`${entry.id}\` — erro: ${msg}\n`);
    }
  }

  const totalFiles = generated.reduce((acc, g) => acc + g.files.length, 0);

  await emitCommandTelemetry({
    workspaceRoot,
    fs,
    audit,
    tracer,
    command: '/batch --generate',
    outcome: `✅ ${generated.length} spec(s) processada(s), ${totalFiles} arquivo(s) gerado(s), ${failed.length} falha(s)`,
    commandExecutionId,
    batchId,
    specId: 'GLOBAL-BATCH',
    specTitle: 'Batch Command',
    specType: 'story',
    llmResponseReceived: true,
    traceDescription: 'batch summary generate',
  });

  stream.markdown(
    `\n---\n\n**Resumo de geração:**\n` +
      `- ✅ ${generated.length} spec(s) processada(s)\n` +
      `- 📄 ${totalFiles} arquivo(s) gerado(s) no total\n` +
      (failed.length > 0 ? `- ❌ ${failed.length} falha(s)\n` : '') +
      '\n⚠️ **Nota:** A última spec processada define o `copilot-instructions.md` ativo. ' +
      'Use `/validate` em uma spec específica para ativá-la individualmente.\n\n' +
      '> ⚠️ **Modo legado:** `/batch --generate` (sem `--unified`) gera configs separadas por spec e não cria agentes `.agent.md`.\n' +
      '> Para múltiplas stories pré-escritas em lote, prefira `@speckit /batch --generate --unified` — gera um agente por story cobrindo implementação e revisão no mesmo contexto.\n',
  );
}

async function processSpec(
  fileName: string,
  hint: 'story' | 'fix',
  specDir: string,
  fs: IFileSystem,
): Promise<SpecEntry> {
  try {
    const content = await fs.readFile(path.join(specDir, fileName));
    const specType = extractSpecType(content);

    if (specType === 'fix' || hint === 'fix') {
      const fix = parseFix(content);
      if (isTerminal(fix.metadata.status)) {
        return {
          fileName,
          specType: 'fix',
          valid: false,
          gapCount: 0,
          title: fix.metadata.title || '(sem título)',
          id: fix.metadata.id,
          gate: fix.metadata.gate,
          status: fix.metadata.status,
        };
      }
      const result = validateFix(fix);
      return {
        fileName,
        specType: 'fix',
        valid: result.valid,
        gapCount: result.gaps.length,
        title: fix.metadata.title || '(sem título)',
        id: fix.metadata.id,
        gate: fix.metadata.gate,
        status: fix.metadata.status,
      };
    }

    const story = parseStory(content);
    if (isTerminal(story.metadata.status)) {
      return {
        fileName,
        specType: 'story',
        valid: false,
        gapCount: 0,
        title: story.metadata.title || '(sem título)',
        id: story.metadata.id,
        gate: story.metadata.gate,
        status: story.metadata.status,
        language: story.technicalSpec.language || undefined,
        framework: story.technicalSpec.framework || undefined,
      };
    }
    const result = validateStory(story);
    return {
      fileName,
      specType: 'story',
      valid: result.valid,
      gapCount: result.gaps.length,
      title: story.metadata.title || '(sem título)',
      id: story.metadata.id,
      gate: story.metadata.gate,
      status: story.metadata.status,
      language: story.technicalSpec.language || undefined,
      framework: story.technicalSpec.framework || undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      fileName,
      specType: hint,
      valid: false,
      gapCount: 0,
      title: '(erro)',
      id: fileName,
      gate: 0,
      status: 'unknown',
      error: msg,
    };
  }
}

function isTerminal(status: string): boolean {
  return status === 'done' || status === 'cancelled';
}

function emitSummary(
  stream: vscode.ChatResponseStream,
  all: SpecEntry[],
  valid: SpecEntry[],
  invalid: SpecEntry[],
  errored: SpecEntry[],
  skipped: SpecEntry[],
): void {
  stream.markdown(
    `**Resultado do batch — ${all.length} spec(s) encontrada(s):**\n\n` +
      `| Status | Spec | Tipo | Título | Gate | Stack |\n` +
      `|--------|------|------|--------|------|-------|\n`,
  );

  for (const e of valid) {
    const stack = e.language ? `${e.language}/${e.framework || '—'}` : '—';
    stream.markdown(
      `| ✅ Válida | \`${e.fileName}\` | ${e.specType} | ${e.title} | ${e.gate} — ${GATE_LABELS[e.gate]} | ${stack} |\n`,
    );
  }
  for (const e of invalid) {
    const stack = e.language ? `${e.language}/${e.framework || '—'}` : '—';
    stream.markdown(
      `| ⚠️ ${e.gapCount} lacuna(s) | \`${e.fileName}\` | ${e.specType} | ${e.title} | ${e.gate} — ${GATE_LABELS[e.gate]} | ${stack} |\n`,
    );
  }
  for (const e of errored) {
    stream.markdown(`| ❌ Erro | \`${e.fileName}\` | ${e.specType} | ${e.error} | — | — |\n`);
  }
  for (const e of skipped) {
    stream.markdown(
      `| ⏭️ ${e.status} | \`${e.fileName}\` | ${e.specType} | ${e.title} | ${e.gate} — ${GATE_LABELS[e.gate]} | — |\n`,
    );
  }

  stream.markdown(
    `\n**Totais:** ✅ ${valid.length} válida(s) | ⚠️ ${invalid.length} inválida(s) | ❌ ${errored.length} erro(s) | ⏭️ ${skipped.length} finalizada(s)\n`,
  );
}

async function handleUnifiedGenerate(
  validEntries: SpecEntry[],
  specDir: string,
  workspaceRoot: string,
  stream: vscode.ChatResponseStream,
  fs: IFileSystem,
  workspace: IWorkspace,
  audit: AuditLogger,
  tracer: TraceabilityManager,
  git: IGitOps,
  commandExecutionId: string,
  batchId: string,
  commandLabel: string,
  control: BatchCommandControl,
): Promise<boolean> {
  stream.markdown('\n---\n\n⏳ Gerando agentes unificados + análise de dependências...\n\n');

  // Parse all valid story specs into Story objects
  const stories: Story[] = [];
  const storyEntries = validEntries.filter((e) => e.specType === 'story');
  const storyEntryById = new Map(storyEntries.map((entry) => [entry.id, entry]));

  for (const entry of storyEntries) {
    try {
      const content = await fs.readFile(path.join(specDir, entry.fileName));
      stories.push(parseStory(content));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`⚠️ Erro ao re-parsear \`${entry.fileName}\` — ignorando.\n`);
      await recordBatchGenerateEvent(
        entry,
        `❌ erro ao preparar story unificada: ${msg}`,
        workspaceRoot,
        fs,
        audit,
        tracer,
        commandExecutionId,
        batchId,
        commandLabel,
      );
    }
  }

  const branchContext = await resolveBatchBranchRuntimeContext(
    stories,
    workspaceRoot,
    stream,
    fs,
    git,
    commandLabel,
    control,
    audit,
    tracer,
    commandExecutionId,
    batchId,
  );
  if (detectBatchBranchMentions(stories).length > 0 && !branchContext) {
    return false;
  }

  const backupPath = await backupCopilotInstructions(workspaceRoot, fs);
  if (backupPath) {
    stream.markdown('💾 Backup do `copilot-instructions.md` anterior salvo.\n\n');
  }

  // Dependency analysis
  const depResult = analyzeDependencies(stories);

  if (depResult.blocked.size > 0) {
    stream.markdown('### ⚠️ Dependências pendentes\n\n');
    for (const [storyId, pending] of depResult.blocked) {
      stream.markdown(
        `- \`${storyId}\` bloqueada por: ${pending.map((d) => `\`${d}\``).join(', ')}\n`,
      );
    }
    stream.markdown('\n');
  }

  if (depResult.independent.length > 0) {
    stream.markdown(
      `### ✅ Stories independentes (prontas para execução)\n\n` +
        depResult.independent.map((id) => `- \`${id}\``).join('\n') +
        '\n\n',
    );
  }

  // Generate unified agents for all story specs (including blocked — user may unblock later)
  const githubDir = path.join(workspaceRoot, '.github');
  const agentsDir = path.join(githubDir, 'agents');
  let agentCount = 0;

  for (const story of stories) {
    const storyEntry = storyEntryById.get(story.metadata.id) ?? {
      fileName: `STORY-${story.metadata.id}.md`,
      specType: 'story' as const,
      valid: true,
      gapCount: 0,
      title: story.metadata.title || '(sem título)',
      id: story.metadata.id,
      gate: story.metadata.gate,
      status: story.metadata.status,
      language: story.technicalSpec.language || undefined,
      framework: story.technicalSpec.framework || undefined,
    };

    try {
      const content = generateUnifiedAgent(story, branchContext);
      const agentPath = path.join(agentsDir, `speckit-story-${story.metadata.id}.agent.md`);
      await fs.writeFile(agentPath, content);
      stream.markdown(`✅ Agente unificado: \`speckit-story-${story.metadata.id}.agent.md\`\n`);
      agentCount++;

      await recordBatchGenerateEvent(
        storyEntry,
        '✅ agente unificado gerado',
        workspaceRoot,
        fs,
        audit,
        tracer,
        commandExecutionId,
        batchId,
        commandLabel,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`❌ Agente \`${story.metadata.id}\` — erro: ${msg}\n`);

      await recordBatchGenerateEvent(
        storyEntry,
        `❌ erro na geração unificada: ${msg}`,
        workspaceRoot,
        fs,
        audit,
        tracer,
        commandExecutionId,
        batchId,
        commandLabel,
      );
    }
  }

  // Generate batch index (copilot-instructions.md)
  const batchIndex = generateBatchIndex(stories, branchContext);
  const instructionsPath = path.join(githubDir, 'copilot-instructions.md');
  await fs.writeFile(instructionsPath, batchIndex);
  stream.markdown(`\n✅ \`copilot-instructions.md\` atualizado (modo batch).\n`);

  // Also generate configs for fix specs using the old path
  const fixEntries = validEntries.filter((e) => e.specType === 'fix');
  let fixCount = 0;
  for (const entry of fixEntries) {
    try {
      const content = await fs.readFile(path.join(specDir, entry.fileName));
      const fix = parseFix(content);
      await generateFixCopilotConfig(workspaceRoot, fix, fs, workspace);
      fixCount++;
      stream.markdown(`✅ Fix \`${entry.id}\` — config gerada\n`);

      await recordBatchGenerateEvent(
        entry,
        '✅ config de fix gerada no modo unificado',
        workspaceRoot,
        fs,
        audit,
        tracer,
        commandExecutionId,
        batchId,
        commandLabel,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`❌ Fix \`${entry.id}\` — erro: ${msg}\n`);

      await recordBatchGenerateEvent(
        entry,
        `❌ erro na geração de fix (modo unificado): ${msg}`,
        workspaceRoot,
        fs,
        audit,
        tracer,
        commandExecutionId,
        batchId,
        commandLabel,
      );
    }
  }

  const fixSummaryLine = fixCount > 0 ? `- 🔧 ${fixCount} fix(es) processado(s)\n` : '';
  const branchGovernanceSummary = generateBatchBranchGovernanceSummary(stories, branchContext);
  const branchModeMessage = generateBatchBranchModeMessage(branchContext);
  stream.markdown(`
---

**Resumo (modo unificado):**
- 🤖 ${agentCount} agente(s) unificado(s) gerado(s)
- 🔗 ${depResult.independent.length} independente(s), ${depResult.blocked.size} bloqueada(s)
${fixSummaryLine}- 📄 \`copilot-instructions.md\` gerado em modo batch

**Próximo passo:** Abra o Copilot Chat e selecione o agente da story desejada no dropdown.
**Importante (modo unificado):** implementação e revisão acontecem no mesmo agente (speckit-story-<id>). Não espere um agente \`speckit-revisor\` separado neste fluxo.
${branchModeMessage}
${branchGovernanceSummary}
Antes do primeiro handoff automático, execute \`@speckit /review-auto --batch-consent\` e confirme o intent retornado.
Ao concluir Gate 2 com sucesso, execute \`@speckit /review-auto --auto\` para persistir \`gate: 3\` e \`status: review\` com evidência visível no chat.
Se o veredito do Gate 3 for ALTERAÇÕES SOLICITADAS, execute \`@speckit /review-auto --changes-requested --auto\`.
Se o veredito do Gate 3 for APROVADO, execute \`@speckit /review-auto --approved --auto\`.
`);

  stream.markdown('\nAção sugerida agora:\n\n');
  emitChatQuickActionButton(
    stream,
    '✅ Iniciar Consentimento Batch',
    '@speckit /review-auto --batch-consent',
  );
  return true;
}

async function recordBatchPhaseEvents(
  entries: SpecEntry[],
  command: string,
  workspaceRoot: string,
  fs: IFileSystem,
  audit: AuditLogger,
  tracer: TraceabilityManager,
  commandExecutionId: string,
  batchId: string,
): Promise<void> {
  for (const entry of entries) {
    const status = entry.error
      ? `erro: ${entry.error}`
      : isTerminal(entry.status)
        ? `status terminal: ${entry.status}`
        : entry.valid
          ? 'válida'
          : `inválida (${entry.gapCount} lacuna[s])`;

    await recordBatchEvent(
      entry,
      command,
      `batch validation — ${status}`,
      workspaceRoot,
      fs,
      audit,
      tracer,
      commandExecutionId,
      batchId,
    );
  }
}

async function recordBatchGenerateEvent(
  entry: SpecEntry,
  outcome: string,
  workspaceRoot: string,
  fs: IFileSystem,
  audit: AuditLogger,
  tracer: TraceabilityManager,
  commandExecutionId: string,
  batchId: string,
  command = '/batch --generate',
): Promise<void> {
  await recordBatchEvent(
    entry,
    command,
    outcome,
    workspaceRoot,
    fs,
    audit,
    tracer,
    commandExecutionId,
    batchId,
  );
}

async function recordBatchEvent(
  entry: SpecEntry,
  command: string,
  outcome: string,
  workspaceRoot: string,
  fs: IFileSystem,
  audit: AuditLogger,
  tracer: TraceabilityManager,
  commandExecutionId: string,
  batchId: string,
): Promise<void> {
  await emitCommandTelemetry({
    workspaceRoot,
    fs,
    audit,
    tracer,
    command,
    outcome,
    commandExecutionId,
    batchId,
    specId: entry.id,
    specTitle: entry.title,
    specType: entry.specType,
    gate: entry.gate,
    llmResponseReceived: true,
    traceDescription: `batch event: ${outcome}`,
  });
}

function resolveBatchCommandLabel(
  generateConfigs: boolean,
  useUnified: boolean,
  storyId?: string,
): string {
  if (generateConfigs && useUnified && storyId) {
    return `/batch --generate --unified --story ${storyId}`;
  }
  if (generateConfigs && useUnified) return '/batch --generate --unified';
  if (generateConfigs) return '/batch --generate';
  return '/batch';
}
