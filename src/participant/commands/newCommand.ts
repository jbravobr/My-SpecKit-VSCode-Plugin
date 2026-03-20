import * as vscode from 'vscode';
import * as path from 'path';
import { generateStoryTemplate } from '../../story/StoryTemplate';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';

export async function handleNewCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = workspace.getWorkspaceRoot();
  if (!workspaceRoot) {
    stream.markdown('❌ Nenhum workspace aberto. Abra uma pasta antes de criar uma história.');
    return;
  }

  const specDir = path.join(workspaceRoot, '.speckit');
  await fs.ensureDir(specDir);

  const existing = await workspace.listStoryFiles(specDir);
  const nextId = String(existing.length + 1).padStart(3, '0');
  const fileName = `STORY-${nextId}.md`;
  const filePath = path.join(specDir, fileName);

  const template = generateStoryTemplate(nextId);
  await fs.writeFile(filePath, template);

  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);

  stream.markdown(
    `✅ História criada: \`.speckit/${fileName}\`\n\n` +
    'Preencha todas as seções marcadas com `<!-- TODO -->`. Quando terminar, use `/validate` para verificar completude.\n\n' +
    '**Seções a preencher:**\n' +
    '- Requisito de Negócio\n' +
    '- Especificação Funcional (User Stories + Critérios de Aceite)\n' +
    '- Especificação Não-Funcional\n' +
    '- Especificação Técnica (linguagem, framework, arquitetura)\n' +
    '- DoR (Definition of Ready)\n' +
    '- DoD (Definition of Done)\n',
  );
}
