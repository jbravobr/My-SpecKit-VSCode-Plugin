import * as path from 'path';
import * as vscode from 'vscode';
import { parseFix } from '../../fix/FixParser';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { Gate } from '../../story/Story';
import { parseStory } from '../../story/StoryParser';
import { validateStory } from '../../story/StoryValidator';
import { AuditLogger } from '../../workflow/AuditLogger';
import { emitCommandTelemetry } from '../../workflow/CommandTelemetry';
import { upsertMetadataFields } from '../../workflow/MetadataPatcher';
import { createCorrelationId } from '../../workflow/ObservabilityContext';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import {
  consumeTransitionIntent,
  createTransitionIntent,
} from '../../workflow/TransitionGovernance';
import {
  formatExplicitConfirmationNotice,
  formatInvalidConfirmationNotice,
  requireWorkspace,
} from './CommandHelpers';

const GATE_LABELS: Record<Gate, string> = {
  0: 'Alinhamento',
  1: 'Implementação',
  2: 'Testes',
  3: 'Revisão',
  4: 'Entrega',
};

interface RetrofitChange {
  fileName: string;
  kind: 'story' | 'fix';
  fromGate: Gate;
  toGate: Gate;
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
    if (token === normalized) {
      const next = tokens[idx + 1];
      if (next && !next.startsWith('--')) return next;
      return undefined;
    }

    if (token.startsWith(`${normalized}=`)) {
      return token.slice(normalized.length + 1).trim();
    }
  }
  return undefined;
}

/**
 * Returns the gate that should be displayed for a spec, treating
 * `done` as Gate 4 even when the file still records a lower gate.
 * `cancelled` is preserved as-is (we don't promote unfinished specs).
 */
function effectiveGate(storedGate: Gate, status: string): Gate {
  if (status === 'done' && storedGate < 4) return 4;
  return storedGate;
}

export async function handleStatusCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const commandExecutionId = createCorrelationId('exec');
  const audit = new AuditLogger(workspaceRoot, fs);
  const tracer = new TraceabilityManager(workspaceRoot, fs);

  const telemetryBase = {
    workspaceRoot,
    fs,
    audit,
    tracer,
    commandExecutionId,
    specId: 'GLOBAL-STATUS',
    specTitle: 'Status Command',
    specType: 'story' as const,
    llmResponseReceived: true,
  };

  const prompt = (request.prompt ?? '').toLowerCase();
  const allTokens = prompt.split(/\s+/).filter(Boolean);
  const flags = allTokens.filter((token) => token.startsWith('--'));
  const allowedFlags = new Set(['--all', '--closed', '--fix', '--confirm']);
  const invalidFlags = flags.filter((flag) => !allowedFlags.has(flag));
  const confirmIntentId = readFlagValue(allTokens, '--confirm');

  if (flags.includes('--confirm') && !confirmIntentId) {
    await emitCommandTelemetry({
      ...telemetryBase,
      command: '/status --fix',
      outcome: '❌ parâmetro inválido para confirmação de retrofit',
      detail: 'Use --confirm <codigo>.',
    });

    stream.markdown(
      '❌ Use `--confirm <codigo>` com o código de confirmação mostrado na proposta de retrofit. Nada será alterado sem esse código.\n',
    );
    stream.markdown(
      '### Comandos disponíveis agora (contextuais)\n' +
        '- `@speckit /status --fix` (gerar proposta de retrofit com novo código de confirmação)\n' +
        '- `@speckit /status` (listar specs sem alteração)\n',
    );
    emitChatQuickActionButton(stream, '🔁 Gerar Proposta de Retrofit', '@speckit /status --fix');
    return;
  }

  if (invalidFlags.length > 0) {
    await emitCommandTelemetry({
      ...telemetryBase,
      command: '/status',
      outcome: '❌ parâmetros inválidos',
      detail: invalidFlags.join(', '),
    });

    stream.markdown(
      `❌ Parâmetro(s) inválido(s) em /status: ${invalidFlags.map((flag) => `\`${flag}\``).join(', ')}\n\n` +
        '**Uso:** `@speckit /status [--all|--closed] [--fix] [--confirm <codigo>]`\n' +
        'Dica: use `--all` para incluir specs `done` e `cancelled`. ' +
        'Use `--fix` para propor retrofit e `--confirm` para aplicar o write.',
    );
    stream.markdown(
      '### Comandos disponíveis agora (contextuais)\n' +
        '- `@speckit /status` (listar abertas com parâmetros válidos)\n' +
        '- `@speckit /status --all` (incluir done/cancelled)\n' +
        '- `@speckit /status --fix` (propor retrofit de gate)\n',
    );
    emitChatQuickActionButton(stream, '📊 Executar /status', '@speckit /status');
    return;
  }

  const specDir = path.join(workspaceRoot, '.speckit');
  const [storyFiles, fixFiles] = await Promise.all([
    workspace.listStoryFiles(specDir),
    workspace.listFixFiles(specDir),
  ]);
  const retrofit = prompt.includes('--fix');
  // --fix implies --all so the user sees the changes that were applied.
  const includeClosed = retrofit || prompt.includes('--all') || prompt.includes('--closed');

  const retrofitChanges: RetrofitChange[] = [];
  if (retrofit) {
    const storyChanges = await collectRetrofitCandidates(storyFiles, specDir, fs, 'story');
    const fixChanges = await collectRetrofitCandidates(fixFiles, specDir, fs, 'fix');
    retrofitChanges.push(...storyChanges, ...fixChanges);

    if (retrofitChanges.length > 0 && !confirmIntentId) {
      const intent = await createTransitionIntent(workspaceRoot, fs, {
        kind: 'status-retrofit',
        command: '/status --fix',
        payload: {
          total: String(retrofitChanges.length),
          files: retrofitChanges
            .map((item) => `${item.kind}:${item.fileName}:${item.fromGate}->${item.toGate}`)
            .join('|'),
        },
        ttlMinutes: 30,
      });

      await emitCommandTelemetry({
        ...telemetryBase,
        command: '/status --fix',
        outcome: '⏳ retrofit proposto aguardando confirmação explícita',
        detail: `Intent-ID: ${intent.id}; arquivos: ${retrofitChanges.length}`,
      });

      stream.markdown(
        `## ⚠️ Confirmação obrigatória para retrofit de gate\n\n` +
          `${formatRetrofitReport(retrofitChanges)}\n\n` +
          formatExplicitConfirmationNotice({
            intentId: intent.id,
            confirmCommand: `@speckit /status --fix --confirm ${intent.id}`,
            confirmEffect: 'as specs listadas acima terão o gate corrigido para Gate 4.',
            noConfirmationEffect: 'nenhuma spec será alterada.',
            ttlMinutes: 30,
          }) +
          '\n',
      );
      stream.markdown(
        '### Comandos disponíveis agora (contextuais)\n' +
          `- \`@speckit /status --fix --confirm ${intent.id}\` (aplicar retrofit proposto)\n` +
          '- `@speckit /status --fix` (descartar este intent e gerar nova proposta)\n' +
          '- `@speckit /status` (consultar lista sem modificar arquivos)\n',
      );
      emitChatQuickActionButton(
        stream,
        '✅ Confirmar Retrofit Proposto',
        `@speckit /status --fix --confirm ${intent.id}`,
      );
      return;
    }

    if (retrofitChanges.length > 0 && confirmIntentId) {
      const intent = await consumeTransitionIntent(
        workspaceRoot,
        fs,
        confirmIntentId,
        'status-retrofit',
      );

      if (!intent) {
        await emitCommandTelemetry({
          ...telemetryBase,
          command: '/status --fix',
          outcome: '❌ retrofit bloqueado: intent inválido/expirado',
          detail: `Intent-ID: ${confirmIntentId}`,
        });

        stream.markdown(
          formatInvalidConfirmationNotice(
            confirmIntentId,
            '@speckit /status --fix',
            'retrofit de gate',
          ),
        );
        stream.markdown(
          '### Comandos disponíveis agora (contextuais)\n' +
            '- `@speckit /status --fix` (gerar novo intent de retrofit)\n' +
            '- `@speckit /status` (ver estado atual das specs)\n',
        );
        emitChatQuickActionButton(
          stream,
          '🔁 Gerar Nova Proposta de Retrofit',
          '@speckit /status --fix',
        );
        return;
      }

      const appliedStoryChanges = await applyRetrofitCandidates(
        retrofitChanges.filter((item) => item.kind === 'story'),
        specDir,
        fs,
      );
      const appliedFixChanges = await applyRetrofitCandidates(
        retrofitChanges.filter((item) => item.kind === 'fix'),
        specDir,
        fs,
      );

      retrofitChanges.length = 0;
      retrofitChanges.push(...appliedStoryChanges, ...appliedFixChanges);

      await emitCommandTelemetry({
        ...telemetryBase,
        command: '/status --fix',
        outcome: '✅ retrofit aplicado com confirmação explícita',
        detail: `Intent-ID: ${intent.id}; arquivos aplicados: ${retrofitChanges.length}`,
      });
    }
  }

  const storyLines = await buildStoryLines(storyFiles, specDir, fs, includeClosed);
  const fixLines = await buildFixLines(fixFiles, specDir, fs, includeClosed);

  const storySection = storyLines.length > 0 ? storyLines.join('\n') : '- nenhuma';
  const fixSection = fixLines.length > 0 ? fixLines.join('\n') : '- nenhum';

  const storyHeader = includeClosed
    ? `**Stories (${storyLines.length}):**`
    : `**Stories abertas (${storyLines.length}):**`;
  const fixHeader = includeClosed
    ? `**Fixes (${fixLines.length}):**`
    : `**Fixes abertos (${fixLines.length}):**`;

  await emitCommandTelemetry({
    ...telemetryBase,
    command: retrofit ? '/status --fix' : '/status',
    outcome:
      `📊 ${storyLines.length} stories, ${fixLines.length} fixes` +
      (includeClosed ? ' (inclui fechadas)' : '') +
      (retrofit ? ` | retrofit: ${retrofitChanges.length} arquivo(s)` : ''),
  });

  if (retrofit) {
    stream.markdown(formatRetrofitReport(retrofitChanges) + '\n\n');
  }
  stream.markdown(`${storyHeader}\n${storySection}\n\n` + `${fixHeader}\n${fixSection}\n`);
  stream.markdown(
    '\n### Comandos disponíveis agora (contextuais)\n' +
      '- `@speckit /status` (atualizar lista de abertas)\n' +
      '- `@speckit /status --all` (incluir done/cancelled)\n' +
      '- `@speckit /status --fix` (propor retrofit de gate para specs done)\n\n' +
      '> Para confirmação de retrofit, use o botão do chat ou o comando com `--confirm <codigo>` que o próprio @speckit informar.\n',
  );
  emitChatQuickActionButton(stream, '📊 Atualizar Status', '@speckit /status');
  emitChatQuickActionButton(stream, '📦 Ver Status Completo (--all)', '@speckit /status --all');
}

function formatRetrofitReport(changes: RetrofitChange[]): string {
  if (changes.length === 0) {
    return '✅ **Retrofit de gate**: nenhuma spec `done` precisava de correção.';
  }
  const rows = changes
    .map((c) => `| \`${c.fileName}\` | Gate ${c.fromGate} | Gate ${c.toGate} |`)
    .join('\n');
  return (
    `✅ **Retrofit de gate aplicado em ${changes.length} arquivo(s):**\n\n` +
    `| Arquivo | Antes | Depois |\n` +
    `| --- | --- | --- |\n` +
    `${rows}`
  );
}

async function collectRetrofitCandidates(
  files: string[],
  specDir: string,
  fs: IFileSystem,
  kind: 'story' | 'fix',
): Promise<RetrofitChange[]> {
  const results: RetrofitChange[] = [];
  for (const name of files) {
    try {
      const filePath = path.join(specDir, name);
      const content = await fs.readFile(filePath);
      const meta =
        kind === 'story'
          ? { status: parseStory(content).metadata.status, gate: parseStory(content).metadata.gate }
          : { status: parseFix(content).metadata.status, gate: parseFix(content).metadata.gate };

      if (meta.status !== 'done' || meta.gate >= 4) continue;

      const patch = upsertMetadataFields(content, { gate: 4 });
      if (patch.changed) {
        results.push({ fileName: name, kind, fromGate: meta.gate, toGate: 4 });
      }
    } catch {
      // ignore unreadable / malformed files; they'll surface in the listing below
    }
  }
  return results;
}

async function applyRetrofitCandidates(
  candidates: RetrofitChange[],
  specDir: string,
  fs: IFileSystem,
): Promise<RetrofitChange[]> {
  const applied: RetrofitChange[] = [];

  for (const candidate of candidates) {
    try {
      const filePath = path.join(specDir, candidate.fileName);
      const content = await fs.readFile(filePath);

      const meta =
        candidate.kind === 'story'
          ? { status: parseStory(content).metadata.status, gate: parseStory(content).metadata.gate }
          : { status: parseFix(content).metadata.status, gate: parseFix(content).metadata.gate };

      if (meta.status !== 'done' || meta.gate >= 4) continue;

      const patch = upsertMetadataFields(content, { gate: 4 });
      if (!patch.changed) continue;

      await fs.writeFile(filePath, patch.content);
      applied.push({ ...candidate, fromGate: meta.gate, toGate: 4 });
    } catch {
      // ignore malformed file in apply phase to keep command resilient
    }
  }

  return applied;
}

async function buildStoryLines(
  files: string[],
  specDir: string,
  fs: IFileSystem,
  includeClosed: boolean,
): Promise<string[]> {
  const results = await Promise.all(
    files.sort().map(async (name) => {
      try {
        const content = await fs.readFile(path.join(specDir, name));
        const story = parseStory(content);
        const isClosed = story.metadata.status === 'done' || story.metadata.status === 'cancelled';
        if (isClosed && !includeClosed) return null;
        const statusIcon = isClosed
          ? story.metadata.status === 'done'
            ? '✅'
            : '⏭️'
          : (() => {
              const result = validateStory(story);
              return result.valid ? '✅' : `⚠️ (${result.gaps.length} lacuna(s))`;
            })();
        const displayedGate = effectiveGate(story.metadata.gate, story.metadata.status);
        const gateLabel = `Gate ${displayedGate} — ${GATE_LABELS[displayedGate]}`;
        return (
          `- ${statusIcon} \`${name}\` — **${story.metadata.title || '(sem título)'}** [${story.metadata.status}]  ` +
          `${story.technicalSpec.language || '—'} / ${story.technicalSpec.framework || '—'} / ${story.technicalSpec.architecture || '—'}` +
          `  | 🚪 ${gateLabel}`
        );
      } catch {
        return `- ⚠️ \`${name}\` — erro ao ler arquivo`;
      }
    }),
  );
  return results.filter((line): line is string => line !== null);
}

async function buildFixLines(
  files: string[],
  specDir: string,
  fs: IFileSystem,
  includeClosed: boolean,
): Promise<string[]> {
  const results = await Promise.all(
    files.sort().map(async (name) => {
      try {
        const content = await fs.readFile(path.join(specDir, name));
        const fix = parseFix(content);
        const isClosed = fix.metadata.status === 'done' || fix.metadata.status === 'cancelled';
        if (isClosed && !includeClosed) return null;
        const severityTag = fix.impactAssessment.severity
          ? ` [${fix.impactAssessment.severity}]`
          : '';
        const displayedGate = effectiveGate(fix.metadata.gate, fix.metadata.status);
        const gateLabel = `Gate ${displayedGate} — ${GATE_LABELS[displayedGate]}`;
        if (isClosed) {
          const statusIcon = fix.metadata.status === 'done' ? '✅' : '⏭️';
          return (
            `- ${statusIcon} \`${name}\` — **${fix.metadata.title || '(sem título)'}**${severityTag} [${fix.metadata.status}]` +
            `  | 🚪 ${gateLabel}`
          );
        }
        return (
          `- 🐛 \`${name}\` — **${fix.metadata.title || '(sem título)'}**${severityTag}` +
          `  | 🚪 ${gateLabel}`
        );
      } catch {
        return `- ⚠️ \`${name}\` — erro ao ler arquivo`;
      }
    }),
  );
  return results.filter((line): line is string => line !== null);
}
