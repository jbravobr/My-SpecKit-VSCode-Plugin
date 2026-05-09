import * as vscode from 'vscode';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import { emitContextualCommands, emitQuickActions, requireWorkspace } from './CommandHelpers';

function formatTraceDetail(trace: {
  specId: string;
  specType: string;
  createdAt: string;
  updatedAt: string;
  entries: Array<{
    timestamp: string;
    type: string;
    description: string;
    data: Record<string, string>;
  }>;
}): string {
  const lines: string[] = [
    `## 🔗 Trace — \`${trace.specId}\`\n`,
    `| Campo | Valor |`,
    `|---|---|`,
    `| Tipo | ${trace.specType} |`,
    `| Criado | ${trace.createdAt} |`,
    `| Atualizado | ${trace.updatedAt} |`,
    `| Entradas | ${trace.entries.length} |`,
    '',
    '### Histórico\n',
  ];
  for (const entry of trace.entries) {
    const dataStr = Object.entries(entry.data)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    lines.push(
      `- **${entry.timestamp}** — \`${entry.type}\`: ${entry.description}${dataStr ? ` (${dataStr})` : ''}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export async function handleTraceCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const arg = request.prompt.trim();
  const tm = new TraceabilityManager(workspaceRoot, fs);

  if (!arg || arg === 'list') {
    const traces = await tm.list();
    if (traces.length === 0) {
      stream.markdown('## 🔗 Rastreabilidade\n\nNenhum registro de rastreabilidade encontrado.\n');
      emitContextualCommands(stream, [
        { command: '@speckit /status', description: 'executar comandos para gerar novos eventos' },
        { command: '@speckit /audit', description: 'inspecionar auditoria da sessão atual' },
      ]);
      emitQuickActions(stream, [
        { title: '📊 Ver Status das Specs', query: '@speckit /status' },
        { title: '📋 Ver Audit Log', query: '@speckit /audit' },
      ]);
      return;
    }

    const rows = traces.map(
      (t) => `| \`${t.specId}\` | ${t.specType} | ${t.entries.length} | ${t.updatedAt} |`,
    );
    stream.markdown(
      `## 🔗 Rastreabilidade\n\n` +
        `${traces.length} spec(s) com trilha registrada.\n\n` +
        '| Spec ID | Tipo | Entradas | Última atualização |\n' +
        '|---|---|---|---|\n' +
        rows.join('\n') +
        '\n\n> Use `@speckit /trace <spec-id>` para ver detalhes.\n',
    );
    emitContextualCommands(stream, [
      {
        command: '@speckit /trace <spec-id>',
        description: 'abrir detalhes de uma spec específica',
      },
      { command: '@speckit /history trace', description: 'visualizar trace em histórico agregado' },
    ]);
    emitQuickActions(stream, [{ title: '🕘 History (trace)', query: '@speckit /history trace' }]);
    return;
  }

  // Detail for specific spec
  const trace = await tm.load(arg);
  if (!trace) {
    stream.markdown(`❌ Nenhum trace encontrado para \`${arg}\`.\n`);
    emitContextualCommands(stream, [
      { command: '@speckit /trace list', description: 'listar IDs válidos de trace' },
      { command: '@speckit /status', description: 'verificar specs disponíveis no workspace' },
    ]);
    emitQuickActions(stream, [{ title: '🔗 Listar Traces', query: '@speckit /trace list' }]);
    return;
  }

  stream.markdown(formatTraceDetail(trace));
  emitContextualCommands(stream, [
    { command: '@speckit /history trace', description: 'ver timeline consolidada por trace' },
    { command: '@speckit /audit', description: 'correlacionar com eventos de auditoria' },
  ]);
  emitQuickActions(stream, [
    { title: '🕘 History (trace)', query: '@speckit /history trace' },
    { title: '📋 Ver Audit Log', query: '@speckit /audit' },
  ]);
}
