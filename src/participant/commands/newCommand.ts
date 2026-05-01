import * as path from 'path';
import * as vscode from 'vscode';
import { loadWorkspaceDefaults } from '../../config/WorkspaceDefaults';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { appendLog } from '../../generator/utils/SessionLogger';
import { generateStoryId } from '../../generator/utils/SpecIdGenerator';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { generateStoryTemplate } from '../../story/StoryTemplate';
import { AuditLogger } from '../../workflow/AuditLogger';
import {
  buildSessionAlias,
  createCorrelationId,
  inferAgentModeFromGate,
} from '../../workflow/ObservabilityContext';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import { handleCommandError, requireWorkspace } from './CommandHelpers';

export async function handleNewCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const specDir = path.join(workspaceRoot, '.speckit');
  await fs.ensureDir(specDir);

  const existing = await workspace.listStoryFiles(specDir);
  const specId = generateStoryId(workspaceRoot, existing);
  const gate = 0;
  const agentMode = inferAgentModeFromGate(gate);
  const commandExecutionId = createCorrelationId('exec');
  const sessionId = createCorrelationId('session');
  const fileName = `${specId}.md`;
  const filePath = path.join(specDir, fileName);

  const defaults = await loadWorkspaceDefaults(workspaceRoot, fs);
  const template = generateStoryTemplate(specId, defaults);
  try {
    await fs.writeFile(filePath, template);
  } catch (err: unknown) {
    handleCommandError(err, stream, 'Erro ao salvar a história');
    return;
  }

  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);

  const sessionAlias = buildSessionAlias(specId, undefined, agentMode, gate);
  const audit = new AuditLogger(workspaceRoot, fs);

  try {
    const tracer = new TraceabilityManager(workspaceRoot, fs);
    await tracer.record(specId, 'story', {
      type: 'file',
      description: 'spec created',
      data: {
        specId,
        fileName,
        command: '/new',
        commandExecutionId,
        sessionId,
        agentMode,
        gate: String(gate),
        sessionAlias,
      },
    });
  } catch {
    // Traceability should never break the main flow
  }

  await audit.log('file_write', `story spec created: ${fileName}`, {
    command: '/new',
    commandExecutionId,
    sessionId,
    specId,
    agentMode,
    gate,
    sessionAlias,
  });

  await appendLog(
    workspaceRoot,
    {
      command: '/new',
      specId,
      outcome: `✅ História criada — ${specId}`,
      commandExecutionId,
      sessionId,
      agentMode,
      gate,
      sessionAlias,
      llmResponseReceived: false,
    },
    fs,
  );

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
