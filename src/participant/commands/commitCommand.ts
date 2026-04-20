import * as vscode from 'vscode';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { appendLog } from '../../generator/utils/SessionLogger';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { gitOps, IGitOps } from '../../workflow/GitOperations';
import { requireWorkspace } from './CommandHelpers';

export async function handleCommitCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  workspace: IWorkspace = vscodeWorkspace,
  fs: IFileSystem = vscodeFileSystem,
  git: IGitOps = gitOps,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const message = request.prompt.trim();
  if (!message) {
    stream.markdown(
      '❌ Forneça uma mensagem de commit.\n\n' +
        '**Exemplo:** `@speckit /commit refactor: extrair validação de gate`\n',
    );
    return;
  }

  try {
    const hasChanges = await git.hasChanges(workspaceRoot);
    if (!hasChanges) {
      stream.markdown('✅ Nada para commitar — working tree limpa.\n');
      return;
    }

    const fullMessage = `speckit: ${message}`;
    const output = await git.commit(workspaceRoot, fullMessage);

    await appendLog(
      workspaceRoot,
      {
        command: '/commit',
        outcome: `✅ Commit realizado — ${fullMessage}`,
      },
      fs,
    );

    stream.markdown(`✅ **Commit realizado:**\n\n\`\`\`\n${output.trim()}\n\`\`\`\n`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`❌ **Erro ao executar git commit:** ${msg}\n`);
  }
}
