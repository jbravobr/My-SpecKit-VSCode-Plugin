import * as vscode from 'vscode';
import { parseStory } from '../../story/StoryParser';
import { validateStory } from '../../story/StoryValidator';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';

export async function handleStatusCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  if (!workspace.getWorkspaceRoot()) {
    stream.markdown('❌ Nenhum workspace aberto. Abra uma pasta ou workspace antes de usar o SpecKit.');
    return;
  }

  const storyPath = await workspace.getActiveStoryPath();
  if (!storyPath) {
    stream.markdown('ℹ️ Nenhuma história encontrada. Use `/new` para criar uma.');
    return;
  }

  const content = await fs.readFile(storyPath);
  const story = parseStory(content);
  const result = validateStory(story);

  const status = result.valid ? '✅ Válida (DoR atingido)' : `⚠️ Incompleta (${result.gaps.length} lacuna(s))`;

  stream.markdown(
    `**História Ativa:** \`${storyPath.split(/[\\/]/).slice(-2).join('/')}\`\n\n` +
    `**Status:** ${status}\n\n` +
    `**ID:** ${story.metadata.id || '—'}\n` +
    `**Título:** ${story.metadata.title || '—'}\n` +
    `**Linguagem:** ${story.technicalSpec.language || '—'}\n` +
    `**Framework:** ${story.technicalSpec.framework || '—'}\n` +
    `**Arquitetura:** ${story.technicalSpec.architecture || '—'}\n`,
  );
}
