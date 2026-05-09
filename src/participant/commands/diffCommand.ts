import * as vscode from 'vscode';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { gitOps, IGitOps } from '../../workflow/GitOperations';
import { emitContextualCommands, emitQuickActions, requireWorkspace } from './CommandHelpers';

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
      emitContextualCommands(stream, [
        { command: '@speckit /status', description: 'inspecionar se há specs pendentes de ação' },
        { command: '@speckit /audit', description: 'verificar eventos recentes da sessão' },
      ]);
      emitQuickActions(stream, [{ title: '📊 Ver Status das Specs', query: '@speckit /status' }]);
      return;
    }
    stream.markdown(
      `## 🔎 Git Diff${full ? ' (completo)' : ' (resumo)'}\n\n\`\`\`diff\n${output}\n\`\`\`\n`,
    );
    emitContextualCommands(stream, [
      { command: '@speckit /diff --full', description: 'mostrar diff completo do workspace' },
      {
        command: '@speckit /commit',
        description: 'gerar commit com mensagem automática da spec ativa',
      },
    ]);
    emitQuickActions(stream, [
      { title: '📄 Ver Diff Completo', query: '@speckit /diff --full' },
      { title: '✅ Commit Automático', query: '@speckit /commit' },
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`❌ **Erro ao executar git diff:** ${msg}\n`);
    emitContextualCommands(stream, [
      { command: '@speckit /doctor', description: 'diagnosticar ambiente do workspace' },
      { command: '@speckit /status', description: 'confirmar estado atual das specs' },
    ]);
    emitQuickActions(stream, [{ title: '🩺 Executar Doctor', query: '@speckit /doctor' }]);
  }
}
