import * as vscode from 'vscode';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';

export async function handleReviewCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  if (!workspace.getWorkspaceRoot()) {
    stream.markdown('❌ Nenhum workspace aberto. Abra uma pasta antes de usar o SpecKit.');
    return;
  }

  const specPath = await workspace.getActiveSpecPath();
  if (!specPath) {
    stream.markdown('❌ Nenhuma história encontrada em `.speckit/`. Use `/new` ou `/fix` para criar uma.');
    return;
  }

  stream.markdown(
    '▶ **Para iniciar a revisão independente:**\n\n' +
    '1. Abra um novo **Copilot Chat**\n' +
    '2. Selecione o modo **Agente**\n' +
    '3. Digite `/review` — o agente assumirá o papel de revisor independente\n\n' +
    'O prompt está em `.github/prompts/review.prompt.md`.\n',
  );
}
