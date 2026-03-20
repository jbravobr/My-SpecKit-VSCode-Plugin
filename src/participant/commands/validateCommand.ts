import * as vscode from 'vscode';
import { parseStory } from '../../story/StoryParser';
import { validateStory } from '../../story/StoryValidator';
import { generateGapFillingPrompt } from '../../generator/story/PromptsGenerator';
import { generateCopilotConfig } from '../../generator/CopilotConfigGenerator';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';

export async function handleValidateCommand(
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

  const dorLines = result.dorStatus
    .map(d => `- [${d.checked ? 'x' : ' '}] ${d.criterion}`)
    .join('\n');

  if (!result.valid) {
    stream.markdown(
      `⚠️ **História incompleta — ${result.gaps.length} lacuna(s) encontrada(s)**\n\n` +
      `**Status do DoR:**\n${dorLines}\n\n` +
      '---\n\n',
    );
    stream.markdown(generateGapFillingPrompt(story, result.gaps));
    return;
  }

  stream.markdown(`✅ **DoR atingido** — história válida.\n\n**Status do DoR:**\n${dorLines}\n\n`);

  stream.markdown('⏳ Gerando arquivos de configuração do Copilot...\n');
  const files = await generateCopilotConfig(workspaceRoot, story, fs);
  const fileList = files.map(f => `- \`${f}\``).join('\n');
  stream.markdown(
    `✅ **${files.length} arquivo(s) gerado(s):**\n\n${fileList}\n\n---\n\n`,
  );

  stream.markdown(
    '▶ **Fluxo de implementação — do início ao código pronto:**\n\n' +
    '**Sessão A — Implementação (portões 0–2):**\n' +
    '1. Abra um novo **Copilot Chat**\n' +
    '2. Selecione o modo **Agente**\n' +
    '3. Digite `/implement` — o agente conduz: alinhamento → implementação → testes\n\n' +
    '**Sessão B — Revisão independente (portões 3–4):**\n' +
    '4. Ao concluir a Sessão A, execute `@speckit /review`\n' +
    '5. Abra um novo **Copilot Chat**\n' +
    '6. Selecione o modo **Agente**\n' +
    '7. Digite `/review` — o agente revisa e valida a entrega\n\n' +
    'Prompts em `.github/prompts/`.\n',
  );
}
