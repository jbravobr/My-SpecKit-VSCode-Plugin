import * as vscode from 'vscode';
import { parseFix } from '../../fix/FixParser';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { appendLog } from '../../generator/utils/SessionLogger';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { extractSpecType } from '../../parser/BaseParser';
import { parseStory } from '../../story/StoryParser';
import { AuditLogger } from '../../workflow/AuditLogger';
import { buildSessionAlias, createCorrelationId } from '../../workflow/ObservabilityContext';
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
    const commandExecutionId = createCorrelationId('exec');
    const sessionId = createCorrelationId('session');
    const active = await resolveActiveSpecContext(workspace, fs);
    const sessionAlias = buildSessionAlias(active.specId, active.specTitle, mode, active.gate);

    await appendLog(
      workspaceRoot,
      {
        command: '/agent',
        specId: active.specId,
        specTitle: active.specTitle,
        outcome: `🔄 Modo alterado para ${getAgentModeLabel(mode)}`,
        commandExecutionId,
        sessionId,
        agentMode: mode,
        gate: active.gate,
        sessionAlias,
        llmResponseReceived: false,
      },
      fs,
    );

    const audit = new AuditLogger(workspaceRoot, fs);
    await audit.log('command', `agent mode changed to ${mode}`, {
      command: '/agent',
      commandExecutionId,
      sessionId,
      specId: active.specId,
      agentMode: mode,
      gate: active.gate,
      sessionAlias,
    });
  }

  const stack = await workspace.detectTechStack();
  const prompt = getAgentModePrompt(mode, stack);

  stream.markdown(`✅ Modo alterado para **${getAgentModeLabel(mode)}**\n\n---\n\n${prompt}\n`);
}

async function resolveActiveSpecContext(
  workspace: IWorkspace,
  fs: IFileSystem,
): Promise<{ specId?: string; specTitle?: string; gate?: number }> {
  const activeSpecPath = await workspace.getActiveSpecPath();
  if (!activeSpecPath) return {};

  try {
    const content = await fs.readFile(activeSpecPath);
    const specType = extractSpecType(content);

    if (specType === 'fix') {
      const fix = parseFix(content);
      return {
        specId: fix.metadata.id,
        specTitle: fix.metadata.title || fix.bugDescription.title || undefined,
        gate: fix.metadata.gate,
      };
    }

    const story = parseStory(content);
    return {
      specId: story.metadata.id,
      specTitle: story.metadata.title || undefined,
      gate: story.metadata.gate,
    };
  } catch {
    return {};
  }
}
