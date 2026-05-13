import * as vscode from 'vscode';
import type { IFileSystem } from '../../generator/utils/IFileSystem';
import type { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { parseStory } from '../../story/StoryParser';
import { scoreStory } from '../../workflow/SpecCompletenessScorer';
import { handleCommandError, requireWorkspace } from './CommandHelpers';

function levelEmoji(level: string): string {
  switch (level) {
    case 'excelente':
      return '🌟';
    case 'alta':
      return '✅';
    case 'média':
      return '⚠️';
    default:
      return '🛑';
  }
}

export async function handleScoreCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const specPath = await workspace.getActiveSpecPath();
  if (!specPath) {
    stream.markdown(
      '❌ Nenhuma spec ativa em `.speckit/`. Use `/new` ou abra um arquivo de spec antes de `/score`.\n',
    );
    return;
  }

  try {
    const content = await fs.readFile(specPath);
    const story = parseStory(content);
    const report = scoreStory(story);

    const lines: string[] = [];
    lines.push(
      `## ${levelEmoji(report.level)} Score da Spec — \`STORY-${story.metadata.id}\`: **${report.score}/100** (${report.level})`,
    );
    lines.push('');
    lines.push('| Dimensão | Peso | Obtido |');
    lines.push('|---|---:|---:|');
    for (const b of report.breakdown) {
      lines.push(`| ${b.label} | ${b.weight} | ${b.earned} |`);
    }
    lines.push('');
    if (report.recommendations.length > 0) {
      lines.push('### Recomendações para subir o score:');
      for (const r of report.recommendations) lines.push(`- ${r}`);
    } else {
      lines.push('✅ Nenhuma lacuna estrutural detectada.');
    }
    stream.markdown(lines.join('\n') + '\n');
  } catch (err) {
    handleCommandError(err, stream, 'Erro ao calcular score da spec');
  }
}
