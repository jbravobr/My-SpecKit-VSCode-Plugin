import * as vscode from 'vscode';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { checkEnvironment, EnvironmentReport, ToolResult, INSTALL_URLS } from '../../generator/utils/EnvironmentChecker';
import { appendLog } from '../../generator/utils/SessionLogger';
import { TechStackDetection } from '../../fix/Fix';

const LANG_LABELS: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  java: 'Java',
  csharp: 'C#',
};

function renderTable(tools: ToolResult[]): string {
  const lines: string[] = [
    '| Ferramenta | Status | Versão |',
    '|------------|--------|--------|',
  ];
  for (const tool of tools) {
    const status = tool.available ? '✅ OK' : '❌ Não encontrado';
    const version = tool.available ? (tool.version ?? '—') : '—';
    lines.push(`| ${tool.name} | ${status} | ${version} |`);
  }
  return lines.join('\n');
}

export function formatReport(report: EnvironmentReport, workspaceRoot: string): string {
  const lines: string[] = [];
  lines.push('## SpecKit — Verificação de Ambiente\n');
  lines.push(`**Workspace:** \`${workspaceRoot}\``);

  if (report.stackLanguage) {
    lines.push(`**Stack detectada:** ${LANG_LABELS[report.stackLanguage] ?? report.stackLanguage}\n`);
  } else {
    lines.push('**Stack detectada:** não identificada — verificando todas as ferramentas\n');
  }

  const core = report.tools.filter(t => t.name === 'Git');
  const node = report.tools.filter(t => t.name === 'Node.js' || t.name === 'npm');
  const python = report.tools.filter(t => t.name === 'Python' || t.name === 'pip');
  const java = report.tools.filter(t => t.name === 'Java' || t.name === 'Maven');
  const dotnet = report.tools.filter(t => t.name === '.NET');

  if (core.length > 0) {
    lines.push('\n### Core');
    lines.push(renderTable(core));
  }

  if (node.length > 0) {
    lines.push('\n### Runtime — TypeScript / JavaScript');
    lines.push(renderTable(node));
  }

  if (python.length > 0) {
    lines.push('\n### Runtime — Python');
    lines.push(renderTable(python));
  }

  if (java.length > 0) {
    lines.push('\n### Runtime — Java');
    lines.push(renderTable(java));
  }

  if (dotnet.length > 0) {
    lines.push('\n### Runtime — C# / .NET');
    lines.push(renderTable(dotnet));
  }

  const missing = report.tools.filter(t => !t.available && t.required);
  lines.push('\n---');

  if (missing.length > 0) {
    lines.push('> ❌ **Ferramentas obrigatórias não encontradas:**');
    for (const t of missing) {
      const url = INSTALL_URLS[t.name];
      const action = url ? `Instalar em ${url}` : 'instalar e adicionar ao PATH';
      lines.push(`> - **${t.name}**: ${action}`);
    }
    lines.push('>\n> Instale as ferramentas acima e adicione-as ao PATH antes de executar os workflows de CI/CD gerados pelo SpecKit.');
  } else {
    lines.push('> ✅ **Todas as ferramentas obrigatórias estão disponíveis.**');
  }

  return lines.join('\n');
}

export async function handleSetupCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  _fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = workspace.getWorkspaceRoot();
  if (!workspaceRoot) {
    stream.markdown('❌ Nenhum workspace aberto. Abra uma pasta antes de usar `/setup`.');
    return;
  }

  let stack: TechStackDetection | undefined;
  try {
    stack = await workspace.detectTechStack();
  } catch {
    stack = undefined;
  }

  const report = checkEnvironment(stack);

  await appendLog(workspaceRoot, {
    command: '/setup',
    outcome: report.tools.some(t => !t.available && t.required)
      ? '⚠️ Ferramentas ausentes detectadas'
      : '✅ Ambiente verificado com sucesso',
  }, _fs);

  stream.markdown(formatReport(report, workspaceRoot));
}
