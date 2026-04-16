import * as vscode from 'vscode';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { AuditLogger } from '../../workflow/AuditLogger';
import { requireWorkspace } from './CommandHelpers';

const DEFAULT_LIMIT = 20;

export async function handleAuditCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const arg = request.prompt.trim();
  const limit = arg ? Math.max(1, Math.min(100, Number(arg) || DEFAULT_LIMIT)) : DEFAULT_LIMIT;

  const audit = new AuditLogger(workspaceRoot, fs);
  const lines = await audit.readLog();

  if (lines.length === 0) {
    stream.markdown('📋 Nenhum registro de auditoria encontrado.\n');
    return;
  }

  const shown = lines.slice(-limit);

  stream.markdown(
    `**📋 Audit Log** — últimas ${shown.length} de ${lines.length} entradas\n\n` +
      '```\n' +
      shown.join('\n') +
      '\n```\n',
  );
}
