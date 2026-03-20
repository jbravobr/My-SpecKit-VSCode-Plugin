import * as vscode from 'vscode';
import { parseStory } from '../../story/StoryParser';
import { validateStory } from '../../story/StoryValidator';
import { generateCopilotConfig } from '../../generator/CopilotConfigGenerator';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';

export async function handleApplyCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = workspace.getWorkspaceRoot();
  if (!workspaceRoot) {
    stream.markdown('❌ Nenhum workspace aberto.');
    return;
  }

  const storyPath = await workspace.getActiveStoryPath();
  if (!storyPath) {
    stream.markdown('❌ Nenhuma história encontrada em `.speckit/`. Use `/new` para criar uma.');
    return;
  }

  const content = await fs.readFile(storyPath);
  const story = parseStory(content);
  const result = validateStory(story);

  if (!result.valid) {
    const gapLines = result.gaps
      .map(g => `- **[${g.section}]** \`${g.field}\`: ${g.message}`)
      .join('\n');
    stream.markdown(
      `⚠️ História incompleta — corrija as lacunas antes de aplicar:\n\n${gapLines}\n\n` +
      'Execute `/validate` para ver o status completo.\n',
    );
    return;
  }

  stream.markdown('⏳ Gerando arquivos de configuração do Copilot...\n');

  const files = await generateCopilotConfig(workspaceRoot, story, fs);

  const fileList = files.map(f => `- \`${f}\``).join('\n');
  stream.markdown(
    `✅ **Configuração aplicada! ${files.length} arquivo(s) gerado(s):**\n\n${fileList}\n\n` +
    '---\n\n' +
    '▶ **Próximo passo — iniciar a implementação:**\n\n' +
    '1. Abra um novo **Copilot Chat**\n' +
    '2. Selecione o modo **Agente**\n' +
    '3. Digite `/implement` — o agente carregará o plano completo\n\n' +
    'O prompt está em `.github/prompts/implement.prompt.md`.\n',
  );
}
