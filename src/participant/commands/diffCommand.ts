import * as vscode from 'vscode';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { gitOps, IGitOps } from '../../workflow/GitOperations';
import { requireWorkspace } from './CommandHelpers';

export async function handleDiffCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  workspace: IWorkspace = vscodeWorkspace,
  git: IGitOps = gitOps,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const arg = request.prompt.trim().toLowerCase();
  const full = arg === '--full' || arg === '-f';

  try {
    const output = await git.diff(workspaceRoot, full);
    if (!output.trim()) {
      stream.markdown('✅ Nenhuma alteração pendente.\n');
      return;
    }
    stream.markdown(
      `**Git Diff${full ? ' (completo)' : ' (resumo)'}:**\n\n\`\`\`diff\n${output}\n\`\`\`\n`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`❌ **Erro ao executar git diff:** ${msg}\n`);
  }
}
