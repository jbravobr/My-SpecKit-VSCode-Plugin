import * as path from 'path';
import * as vscode from 'vscode';
import { generateFixTemplate } from '../../fix/FixTemplate';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { appendLog } from '../../generator/utils/SessionLogger';
import { generateFixId } from '../../generator/utils/SpecIdGenerator';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { AuditLogger } from '../../workflow/AuditLogger';
import {
  buildSessionAlias,
  createCorrelationId,
  inferAgentModeFromGate,
} from '../../workflow/ObservabilityContext';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import { handleCommandError, requireWorkspace } from './CommandHelpers';

export async function handleFixCommand(
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

  const existing = await workspace.listFixFiles(specDir);
  const specId = generateFixId(workspaceRoot, existing);
  const gate = 0;
  const agentMode = inferAgentModeFromGate(gate);
  const commandExecutionId = createCorrelationId('exec');
  const sessionId = createCorrelationId('session');
  const fileName = `${specId}.md`;
  const filePath = path.join(specDir, fileName);

  const template = generateFixTemplate(specId);
  try {
    await fs.writeFile(filePath, template);
  } catch (err: unknown) {
    handleCommandError(err, stream, 'Erro ao salvar o fix');
    return;
  }

  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);

  const sessionAlias = buildSessionAlias(specId, undefined, agentMode, gate);
  const audit = new AuditLogger(workspaceRoot, fs);

  try {
    const tracer = new TraceabilityManager(workspaceRoot, fs);
    await tracer.record(specId, 'fix', {
      type: 'file',
      description: 'fix created',
      data: {
        specId,
        fileName,
        command: '/fix',
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

  await audit.log('file_write', `fix spec created: ${fileName}`, {
    command: '/fix',
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
      command: '/fix',
      specId,
      outcome: `✅ Fix criado — ${specId}`,
      commandExecutionId,
      sessionId,
      agentMode,
      gate,
      sessionAlias,
      llmResponseReceived: false,
    },
    fs,
  );

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
