import * as vscode from 'vscode';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { appendLog } from '../../generator/utils/SessionLogger';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import {
  AGENT_MODES,
  AgentModeName,
  getActiveAgentMode,
  getAgentModeLabel,
  getAgentModePrompt,
  isValidAgentMode,
  setActiveAgentMode,
} from '../AgentMode';

export async function handleAgentCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  workspace: IWorkspace = vscodeWorkspace,
  fs: IFileSystem = vscodeFileSystem,
): Promise<void> {
  const requested = request.prompt.trim().toLowerCase();

  if (!requested) {
    const current = getActiveAgentMode();
    stream.markdown(
      `**Modo ativo:** ${getAgentModeLabel(current)}\n\n` +
        '**Modos disponíveis:**\n' +
        AGENT_MODES.map((m) => `- \`${m}\` — ${getAgentModeLabel(m)}`).join('\n') +
        '\n\n**Uso:** `@speckit /agent debugger`\n',
    );
    return;
  }

  if (!isValidAgentMode(requested)) {
    stream.markdown(
      `❌ Modo inválido: \`${requested}\`\n\n` +
        '**Modos disponíveis:**\n' +
        AGENT_MODES.map((m) => `- \`${m}\` — ${getAgentModeLabel(m)}`).join('\n') +
        '\n',
    );
    return;
  }

  const mode: AgentModeName = requested;
  setActiveAgentMode(mode);

  const workspaceRoot = workspace.getWorkspaceRoot();
  if (workspaceRoot) {
    await appendLog(
      workspaceRoot,
      {
        command: '/agent',
        outcome: `🔄 Modo alterado para ${getAgentModeLabel(mode)}`,
      },
      fs,
    );
  }

  const stack = await workspace.detectTechStack();
  const prompt = getAgentModePrompt(mode, stack);

  stream.markdown(`✅ Modo alterado para **${getAgentModeLabel(mode)}**\n\n---\n\n${prompt}\n`);
}
