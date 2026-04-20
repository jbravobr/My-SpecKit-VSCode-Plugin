import * as vscode from 'vscode';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import { requireWorkspace } from './CommandHelpers';

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
      stream.markdown('🔗 Nenhum registro de rastreabilidade encontrado.\n');
      return;
    }

    const rows = traces.map(
      (t) => `| \`${t.specId}\` | ${t.specType} | ${t.entries.length} | ${t.updatedAt} |`,
    );
    stream.markdown(
      `**🔗 Rastreabilidade** — ${traces.length} spec(s)\n\n` +
        '| Spec ID | Tipo | Entradas | Última atualização |\n' +
        '|---|---|---|---|\n' +
        rows.join('\n') +
        '\n\n> Use `@speckit /trace <spec-id>` para ver detalhes.\n',
    );
    return;
  }

  // Detail for specific spec
  const trace = await tm.load(arg);
  if (!trace) {
    stream.markdown(`❌ Nenhum trace encontrado para \`${arg}\`.\n`);
    return;
  }

  stream.markdown(formatTraceDetail(trace));
}
