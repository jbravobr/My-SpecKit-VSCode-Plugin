import * as vscode from 'vscode';
import * as path from 'path';
import { parseStory } from '../../story/StoryParser';
import { validateStory } from '../../story/StoryValidator';
import { parseFix } from '../../fix/FixParser';
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
  const workspaceRoot = workspace.getWorkspaceRoot();
  if (!workspaceRoot) {
    stream.markdown('❌ Nenhum workspace aberto. Abra uma pasta ou workspace antes de usar o SpecKit.');
    return;
  }

  const specDir = path.join(workspaceRoot, '.speckit');
  const [storyFiles, fixFiles] = await Promise.all([
    workspace.listStoryFiles(specDir),
    workspace.listFixFiles(specDir),
  ]);

  const storyLines = await buildStoryLines(storyFiles, specDir, fs);
  const fixLines = await buildFixLines(fixFiles, specDir, fs);

  const storySection =
    storyLines.length > 0
      ? storyLines.join('\n')
      : '- nenhuma';

  const fixSection =
    fixLines.length > 0
      ? fixLines.join('\n')
      : '- nenhum';

  stream.markdown(
    `**Stories abertas (${storyLines.length}):**\n${storySection}\n\n` +
    `**Fixes abertos (${fixLines.length}):**\n${fixSection}\n`,
  );
}

async function buildStoryLines(
  files: string[],
  specDir: string,
  fs: IFileSystem,
): Promise<string[]> {
  const lines: string[] = [];
  for (const name of files.sort()) {
    try {
      const content = await fs.readFile(path.join(specDir, name));
      const story = parseStory(content);
      if (story.metadata.status === 'done') continue;
      const result = validateStory(story);
      const statusIcon = result.valid ? '✅' : `⚠️ (${result.gaps.length} lacuna(s))`;
      lines.push(
        `- ${statusIcon} \`${name}\` — **${story.metadata.title || '(sem título)'}**  ` +
        `${story.technicalSpec.language || '—'} / ${story.technicalSpec.framework || '—'} / ${story.technicalSpec.architecture || '—'}`,
      );
    } catch {
      lines.push(`- ⚠️ \`${name}\` — erro ao ler arquivo`);
    }
  }
  return lines;
}

async function buildFixLines(
  files: string[],
  specDir: string,
  fs: IFileSystem,
): Promise<string[]> {
  const lines: string[] = [];
  for (const name of files.sort()) {
    try {
      const content = await fs.readFile(path.join(specDir, name));
      const fix = parseFix(content);
      if (fix.metadata.status === 'done') continue;
      const severityTag = fix.impactAssessment.severity ? ` [${fix.impactAssessment.severity}]` : '';
      lines.push(
        `- 🐛 \`${name}\` — **${fix.metadata.title || '(sem título)'}**${severityTag}`,
      );
    } catch {
      lines.push(`- ⚠️ \`${name}\` — erro ao ler arquivo`);
    }
  }
  return lines;
}
