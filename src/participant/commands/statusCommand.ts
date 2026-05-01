import * as path from 'path';
import * as vscode from 'vscode';
import { parseFix } from '../../fix/FixParser';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { appendLog } from '../../generator/utils/SessionLogger';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { Gate } from '../../story/Story';
import { parseStory } from '../../story/StoryParser';
import { validateStory } from '../../story/StoryValidator';
import { upsertMetadataFields } from '../../workflow/MetadataPatcher';
import { requireWorkspace } from './CommandHelpers';

const GATE_LABELS: Record<Gate, string> = {
  0: 'Alinhamento',
  1: 'Implementação',
  2: 'Testes',
  3: 'Revisão',
  4: 'Entrega',
};

interface RetrofitChange {
  fileName: string;
  fromGate: Gate;
  toGate: Gate;
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

  const prompt = (request.prompt ?? '').toLowerCase();
  const flags = prompt.split(/\s+/).filter((token) => token.startsWith('--'));
  const allowedFlags = new Set(['--all', '--closed', '--fix']);
  const invalidFlags = flags.filter((flag) => !allowedFlags.has(flag));

  if (invalidFlags.length > 0) {
    stream.markdown(
      `❌ Parâmetro(s) inválido(s) em /status: ${invalidFlags.map((flag) => `\`${flag}\``).join(', ')}\n\n` +
        '**Uso:** `@speckit /status [--all|--closed] [--fix]`\n' +
        'Dica: use `--all` para incluir specs `done` e `cancelled`. ' +
        'Use `--fix` para retro-persistir `gate: 4` em specs com `status: done` mas gate desatualizado.',
    );
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
    const storyChanges = await retrofitGateForDoneSpecs(storyFiles, specDir, fs, 'story');
    const fixChanges = await retrofitGateForDoneSpecs(fixFiles, specDir, fs, 'fix');
    retrofitChanges.push(...storyChanges, ...fixChanges);
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

  await appendLog(
    workspaceRoot,
    {
      command: retrofit ? '/status --fix' : '/status',
      outcome:
        `📊 ${storyLines.length} stories, ${fixLines.length} fixes` +
        (includeClosed ? ' (inclui fechadas)' : '') +
        (retrofit ? ` | retrofit: ${retrofitChanges.length} arquivo(s)` : ''),
    },
    fs,
  );

  if (retrofit) {
    stream.markdown(formatRetrofitReport(retrofitChanges) + '\n\n');
  }
  stream.markdown(`${storyHeader}\n${storySection}\n\n` + `${fixHeader}\n${fixSection}\n`);
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

async function retrofitGateForDoneSpecs(
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
        await fs.writeFile(filePath, patch.content);
        results.push({ fileName: name, fromGate: meta.gate, toGate: 4 });
      }
    } catch {
      // ignore unreadable / malformed files; they'll surface in the listing below
    }
  }
  return results;
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
