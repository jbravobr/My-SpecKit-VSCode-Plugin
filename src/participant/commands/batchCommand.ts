import * as path from 'path';
import * as vscode from 'vscode';
import { parseFix } from '../../fix/FixParser';
import { validateFix } from '../../fix/FixValidator';
import { generateCopilotConfig } from '../../generator/CopilotConfigGenerator';
import { generateFixCopilotConfig } from '../../generator/FixCopilotConfigGenerator';
import { generateUnifiedAgent } from '../../generator/agent/StoryUnifiedAgentGenerator';
import { generateBatchIndex } from '../../generator/story/BatchIndexGenerator';
import { backupCopilotInstructions } from '../../generator/utils/BackupManager';
import { analyzeDependencies } from '../../generator/utils/DependencyGraph';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { appendLog } from '../../generator/utils/SessionLogger';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { extractSpecType } from '../../parser/BaseParser';
import type { Gate, Story } from '../../story/Story';
import { parseStory } from '../../story/StoryParser';
import { validateStory } from '../../story/StoryValidator';
import { AuditLogger } from '../../workflow/AuditLogger';
import {
  buildSessionAlias,
  createCorrelationId,
  inferAgentModeFromGate,
} from '../../workflow/ObservabilityContext';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
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

export async function handleBatchCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const prompt = (request.prompt ?? '').toLowerCase();
  const flags = prompt.split(/\s+/).filter((token) => token.startsWith('--'));
  const allowedFlags = new Set(['--generate', '--gen', '--unified']);
  const invalidFlags = flags.filter((flag) => !allowedFlags.has(flag));

  if (invalidFlags.length > 0) {
    stream.markdown(
      `❌ Parâmetro(s) inválido(s) em /batch: ${invalidFlags.map((flag) => `\`${flag}\``).join(', ')}\n\n` +
        '**Uso:** `@speckit /batch [--generate|--gen] [--unified]`\n' +
        'Dica: para modo unificado, use `@speckit /batch --generate --unified`.',
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

  const generateConfigs = prompt.includes('--generate') || prompt.includes('--gen');
  const useUnified = prompt.includes('--unified');
  const phaseCommand = resolveBatchCommandLabel(generateConfigs, useUnified);

  // Phase 1: Parse + Validate all specs in parallel (read-only, safe)
  const entries = await Promise.all(
    allFiles.map(({ name, hint }) => processSpec(name, hint, specDir, fs)),
  );

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

  if (!generateConfigs) {
    stream.markdown(
      '\n---\n\n' +
        '💡 Para gerar configuração Copilot para todas as specs válidas, execute:\n' +
        '`@speckit /batch --generate`\n\n' +
        '💡 Para gerar agentes unificados (implementador + revisor por story):\n' +
        '`@speckit /batch --generate --unified`\n',
    );
    await appendLog(
      workspaceRoot,
      {
        command: '/batch',
        outcome: `📊 ${valid.length} válida(s), ${invalid.length} inválida(s), ${errored.length} erro(s), ${skipped.length} finalizada(s)`,
        commandExecutionId,
        batchId,
        llmResponseReceived: true,
      },
      fs,
    );
    return;
  }

  if (valid.length === 0) {
    stream.markdown('\n⚠️ Nenhuma spec válida para gerar configuração.\n');
    return;
  }

  if (useUnified) {
    await handleUnifiedGenerate(
      valid,
      specDir,
      workspaceRoot,
      stream,
      fs,
      audit,
      tracer,
      commandExecutionId,
      batchId,
    );
    await appendLog(
      workspaceRoot,
      {
        command: '/batch --generate --unified',
        outcome: `Agentes unificados gerados para ${valid.length} spec(s)`,
        commandExecutionId,
        batchId,
        llmResponseReceived: true,
      },
      fs,
    );
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

  await appendLog(
    workspaceRoot,
    {
      command: '/batch --generate',
      outcome: `✅ ${generated.length} spec(s) processada(s), ${totalFiles} arquivo(s) gerado(s), ${failed.length} falha(s)`,
      commandExecutionId,
      batchId,
      llmResponseReceived: true,
    },
    fs,
  );

  stream.markdown(
    `\n---\n\n**Resumo de geração:**\n` +
      `- ✅ ${generated.length} spec(s) processada(s)\n` +
      `- 📄 ${totalFiles} arquivo(s) gerado(s) no total\n` +
      (failed.length > 0 ? `- ❌ ${failed.length} falha(s)\n` : '') +
      '\n⚠️ **Nota:** A última spec processada define o `copilot-instructions.md` ativo. ' +
      'Use `/validate` em uma spec específica para ativá-la individualmente.\n',
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
  audit: AuditLogger,
  tracer: TraceabilityManager,
  commandExecutionId: string,
  batchId: string,
): Promise<void> {
  stream.markdown('\n---\n\n⏳ Gerando agentes unificados + análise de dependências...\n\n');

  const backupPath = await backupCopilotInstructions(workspaceRoot, fs);
  if (backupPath) {
    stream.markdown('💾 Backup do `copilot-instructions.md` anterior salvo.\n\n');
  }

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
        '/batch --generate --unified',
      );
    }
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
      const content = generateUnifiedAgent(story);
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
        '/batch --generate --unified',
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
        '/batch --generate --unified',
      );
    }
  }

  // Generate batch index (copilot-instructions.md)
  const batchIndex = generateBatchIndex(stories);
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
      await generateFixCopilotConfig(workspaceRoot, fix, fs);
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
        '/batch --generate --unified',
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
        '/batch --generate --unified',
      );
    }
  }

  const fixSummaryLine = fixCount > 0 ? `- 🔧 ${fixCount} fix(es) processado(s)\n` : '';
  stream.markdown(`
---

**Resumo (modo unificado):**
- 🤖 ${agentCount} agente(s) unificado(s) gerado(s)
- 🔗 ${depResult.independent.length} independente(s), ${depResult.blocked.size} bloqueada(s)
${fixSummaryLine}- 📄 \`copilot-instructions.md\` gerado em modo batch

**Próximo passo:** Abra o Copilot Chat e selecione o agente da story desejada no dropdown.
**Importante (modo unificado):** implementação e revisão acontecem no mesmo agente (speckit-story-<id>). Não espere um agente \`speckit-revisor\` separado neste fluxo.
**Estratégia de branch (modo unificado):** use uma branch única do lote (ex: \`feature/batch-<yyyymmdd>-<slug>\`). Não crie branch por story e não empilhe branches de stories.
Ao concluir Gate 2 com sucesso, execute \`@speckit /review-auto\` para persistir \`gate: 3\` e \`status: review\` com evidência visível no chat.
Se o veredito do Gate 3 for ALTERAÇÕES SOLICITADAS, execute \`@speckit /review-auto --changes-requested\`.
Se o veredito do Gate 3 for APROVADO, execute \`@speckit /review-auto --approved\`.
`);
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
  const agentMode = inferAgentModeFromGate(entry.gate);
  const sessionId = createCorrelationId('session');
  const sessionAlias = buildSessionAlias(entry.id, entry.title, agentMode, entry.gate);

  await appendLog(
    workspaceRoot,
    {
      command,
      specId: entry.id,
      specTitle: entry.title,
      outcome,
      commandExecutionId,
      sessionId,
      batchId,
      agentMode,
      gate: entry.gate,
      sessionAlias,
    },
    fs,
  );

  await audit.log('command', `batch item ${entry.id}: ${outcome}`, {
    command,
    commandExecutionId,
    batchId,
    sessionId,
    specId: entry.id,
    agentMode,
    gate: entry.gate,
    sessionAlias,
  });

  try {
    await tracer.record(entry.id, entry.specType, {
      type: 'custom',
      description: `batch event: ${outcome}`,
      data: {
        command,
        commandExecutionId,
        batchId,
        sessionId,
        specId: entry.id,
        agentMode,
        gate: String(entry.gate),
        sessionAlias,
      },
    });
  } catch {
    // Traceability should never break the main flow
  }
}

function resolveBatchCommandLabel(generateConfigs: boolean, useUnified: boolean): string {
  if (generateConfigs && useUnified) return '/batch --generate --unified';
  if (generateConfigs) return '/batch --generate';
  return '/batch';
}
