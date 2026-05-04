import * as path from 'path';
import * as vscode from 'vscode';
import { loadWorkspaceDefaults } from '../../config/WorkspaceDefaults';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { generateStoryId } from '../../generator/utils/SpecIdGenerator';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { generateStoryTemplate } from '../../story/StoryTemplate';
import { AuditLogger } from '../../workflow/AuditLogger';
import { emitCommandTelemetry } from '../../workflow/CommandTelemetry';
import { createCorrelationId } from '../../workflow/ObservabilityContext';
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
  const commandExecutionId = createCorrelationId('exec');
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

  const audit = new AuditLogger(workspaceRoot, fs);
  const tracer = new TraceabilityManager(workspaceRoot, fs);

  await emitCommandTelemetry({
    workspaceRoot,
    fs,
    audit,
    tracer,
    command: '/new',
    outcome: `✅ História criada — ${specId}`,
    detail: `Arquivo: ${fileName}`,
    commandExecutionId,
    specId,
    specType: 'story',
    gate,
    llmResponseReceived: false,
    auditEvent: 'file_write',
    traceType: 'file',
    traceDescription: 'spec created',
    traceData: {
      fileName,
    },
  });

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
