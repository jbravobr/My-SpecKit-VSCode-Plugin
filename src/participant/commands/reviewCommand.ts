import * as vscode from 'vscode';
import * as path from 'path';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { appendLog } from '../../generator/utils/SessionLogger';

function extractSpecType(content: string): 'story' | 'fix' {
  const metaMatch = /<!--\s*metadata\s*([\s\S]*?)-->/.exec(content);
  if (!metaMatch) return 'story';
  const typeMatch = /^type:\s*(.+)$/m.exec(metaMatch[1]);
  return typeMatch?.[1]?.trim() === 'fix' ? 'fix' : 'story';
}

export async function handleReviewCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  workspace: IWorkspace = vscodeWorkspace,
  fs: IFileSystem = vscodeFileSystem,
): Promise<void> {
  const workspaceRoot = workspace.getWorkspaceRoot();
  if (!workspaceRoot) {
    stream.markdown('❌ Nenhum workspace aberto. Abra uma pasta antes de usar o SpecKit.');
    return;
  }

  const specPath = await workspace.getActiveSpecPath();
  if (!specPath) {
    stream.markdown('❌ Nenhuma spec encontrada em `.speckit/`. Use `/new`, `/fix` ou `/draft` para criar uma.');
    return;
  }

  const content = await fs.readFile(specPath);
  const specType = extractSpecType(content);

  const metaMatch = /<!--\s*metadata\s*([\s\S]*?)-->/.exec(content);
  const idMatch    = metaMatch ? /^id:\s*(.+)$/m.exec(metaMatch[1])    : null;
  const titleMatch = metaMatch ? /^title:\s*(.+)$/m.exec(metaMatch[1]) : null;
  const specId    = idMatch?.[1]?.trim();
  const specTitle = titleMatch?.[1]?.trim();

  const promptFile = specType === 'fix' ? 'fix-review.prompt.md' : 'review.prompt.md';
  const promptPath = path.join(workspaceRoot, '.github', 'prompts', promptFile);

  const promptExists = await fs.fileExists(promptPath);
  if (!promptExists) {
    await appendLog(workspaceRoot, {
      command: '/review',
      specId,
      specTitle,
      outcome: `❌ Prompt não encontrado: ${promptFile}`,
    }, fs);
    stream.markdown(
      `❌ Arquivo \`.github/prompts/${promptFile}\` não encontrado.\n\n` +
      'Execute `@speckit /validate` primeiro para gerar os arquivos de configuração do Copilot.\n',
    );
    return;
  }

  await appendLog(workspaceRoot, {
    command: '/review',
    specId,
    specTitle,
    outcome: `✅ Prompt entregue: ${promptFile}`,
  }, fs);

  stream.markdown(
    '▶ **Para iniciar a revisão independente:**\n\n' +
    '1. Abra um **novo** Copilot Chat\n' +
    '2. Selecione o modo **Agente**\n' +
    `3. Anexe o arquivo \`.github/prompts/${promptFile}\` (ícone de clipe → Prompt) e envie\n\n` +
    '> O agente assumirá o papel de revisor independente com base nesse prompt.\n',
  );
}
