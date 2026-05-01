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
import { requireWorkspace } from './CommandHelpers';

const GATE_LABELS: Record<Gate, string> = {
  0: 'Alinhamento',
  1: 'Implementação',
  2: 'Testes',
  3: 'Revisão',
  4: 'Entrega',
};

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
  const allowedFlags = new Set(['--all', '--closed']);
  const invalidFlags = flags.filter((flag) => !allowedFlags.has(flag));

  if (invalidFlags.length > 0) {
    stream.markdown(
      `❌ Parâmetro(s) inválido(s) em /status: ${invalidFlags.map((flag) => `\`${flag}\``).join(', ')}\n\n` +
        '**Uso:** `@speckit /status [--all|--closed]`\n' +
        'Dica: use `--all` para incluir specs `done` e `cancelled`.',
    );
    return;
  }

  const specDir = path.join(workspaceRoot, '.speckit');
  const [storyFiles, fixFiles] = await Promise.all([
    workspace.listStoryFiles(specDir),
    workspace.listFixFiles(specDir),
  ]);
  const includeClosed = prompt.includes('--all') || prompt.includes('--closed');

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
      command: '/status',
      outcome: `📊 ${storyLines.length} stories, ${fixLines.length} fixes${includeClosed ? ' (inclui fechadas)' : ''}`,
    },
    fs,
  );

  stream.markdown(`${storyHeader}\n${storySection}\n\n` + `${fixHeader}\n${fixSection}\n`);
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
        const gate = story.metadata.gate;
        const gateLabel = `Gate ${gate} — ${GATE_LABELS[gate]}`;
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
        const gate = fix.metadata.gate;
        const gateLabel = `Gate ${gate} — ${GATE_LABELS[gate]}`;
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
