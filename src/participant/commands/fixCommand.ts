import * as path from 'path';
import * as vscode from 'vscode';
import { generateFixTemplate } from '../../fix/FixTemplate';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';

export async function handleFixCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = workspace.getWorkspaceRoot();
  if (!workspaceRoot) {
    stream.markdown('❌ Nenhum workspace aberto. Abra uma pasta antes de criar um fix.');
    return;
  }

  const specDir = path.join(workspaceRoot, '.speckit');
  await fs.ensureDir(specDir);

  const existing = await workspace.listFixFiles(specDir);
  const nextId = String(existing.length + 1).padStart(3, '0');
  const fileName = `FIX-${nextId}.md`;
  const filePath = path.join(specDir, fileName);

  const template = generateFixTemplate(nextId);
  try {
    await fs.writeFile(filePath, template);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`❌ **Erro ao salvar o fix:** ${msg}\n`);
    return;
  }

  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);

  stream.markdown(
    `✅ Fix criado: \`.speckit/${fileName}\`\n\n` +
      'Preencha as seções marcadas com `<!-- TODO -->`. Quando terminar, use `/validate` para verificar completude e gerar os arquivos de configuração.\n\n' +
      '**Seções a preencher:**\n' +
      '- Bug Description (título, sintomas, passos para reproduzir)\n' +
      '- Root Cause Hypothesis (hipótese, arquivos/componentes suspeitos)\n' +
      '- Impact Assessment (severidade)\n' +
      '- Regression Prevention (testes a adicionar)\n' +
      '- DoF (Definition of Fixed)\n\n' +
      '> A stack técnica é detectada automaticamente do workspace — não é necessário especificá-la.\n',
  );
}
