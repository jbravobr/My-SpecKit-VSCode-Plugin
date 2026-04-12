import * as path from 'path';
import * as vscode from 'vscode';
import { loadWorkspaceDefaults } from '../../config/WorkspaceDefaults';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { generateStoryTemplate } from '../../story/StoryTemplate';

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

  const defaults = await loadWorkspaceDefaults(workspaceRoot, fs);
  const template = generateStoryTemplate(nextId, defaults);
  try {
    await fs.writeFile(filePath, template);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`❌ **Erro ao salvar a história:** ${msg}\n`);
    return;
  }

  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);

  const defaultsNote =
    Object.keys(defaults).length > 0
      ? '\n💡 _Defaults aplicados de `.speckit/defaults.yml`._\n'
      : '';

  stream.markdown(
    `✅ História criada: \`.speckit/${fileName}\`\n${defaultsNote}\n` +
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
