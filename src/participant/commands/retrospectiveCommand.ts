import * as vscode from 'vscode';
import type { IFileSystem } from '../../generator/utils/IFileSystem';
import type { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { analyzeRetrospective } from '../../workflow/RetrospectiveAnalyzer';
import {
  emitContextualCommands,
  emitQuickActions,
  handleCommandError,
  requireWorkspace,
} from './CommandHelpers';

export async function handleRetrospectiveCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  try {
    const report = await analyzeRetrospective({ workspaceRoot, fs });

    if (report.isEmpty) {
      stream.markdown(
        '## 🔁 Retrospectiva SpecKit\n\n' +
          'Ainda não há histórico suficiente para uma retrospectiva automática.\n\n' +
          `- ${report.recommendations[0] ?? 'Rode validações para gerar histórico.'}\n` +
          '- Use `/verify` para gerar evidências estruturadas por gate.\n' +
          '- Use `/history` para consolidar audit/trace/log.\n' +
          '- Use `/metrics` para acompanhar eventos de validação.\n',
      );
      emitContextualCommands(stream, [
        { command: '@speckit /verify', description: 'gerar evidências e iterações por gate' },
        { command: '@speckit /history', description: 'consolidar audit, trace e log em uma timeline' },
        { command: '@speckit /metrics', description: 'inspecionar métricas locais de validação' },
      ]);
      emitQuickActions(stream, [
        { title: '✅ Rodar Verify', query: '@speckit /verify' },
        { title: '🕘 Abrir History', query: '@speckit /history' },
        { title: '📊 Ver Metrics', query: '@speckit /metrics' },
      ]);
      return;
    }

    const lines: string[] = [];
    lines.push('## 🔁 Retrospectiva SpecKit');
    lines.push('');
    lines.push(`**Specs analisadas:** ${report.specCount}`);
    lines.push(`**Gates com histórico:** ${Object.keys(report.avgIterationsPerGate).length}`);
    lines.push('');
    lines.push('### Resumo de iterações por gate');
    lines.push('| Gate | Média de iterações |');
    lines.push('|---|---:|');
    for (const [gateLabel, average] of Object.entries(report.avgIterationsPerGate)) {
      lines.push(`| ${gateLabel} | ${average.toFixed(2)} |`);
    }
    if (Object.keys(report.avgIterationsPerGate).length === 0) {
      lines.push('| _(sem dados)_ | 0.00 |');
    }
    lines.push('');
    lines.push('### Top achados recorrentes');
    lines.push('| Achado | Ocorrências | Severidade |');
    lines.push('|---|---:|---|');
    if (report.topRecurringFindings.length === 0) {
      lines.push('| _(nenhum achado recorrente mapeado)_ | 0 | info |');
    } else {
      for (const finding of report.topRecurringFindings) {
        lines.push(`| ${escapeCell(finding.message)} | ${finding.count} | ${finding.severity} |`);
      }
    }
    lines.push('');
    lines.push('### Gates com mais regressões');
    lines.push('| Gate | Regressões |');
    lines.push('|---|---:|');
    if (report.mostRegressedGates.length === 0) {
      lines.push('| _(nenhum)_ | 0 |');
    } else {
      for (const gate of report.mostRegressedGates) {
        lines.push(`| Gate ${gate.gate} | ${gate.regressionCount} |`);
      }
    }
    lines.push('');
    lines.push('### Recomendações acionáveis');
    for (const recommendation of report.recommendations) {
      lines.push(`- ${recommendation}`);
    }
    lines.push('');
    lines.push('### Quick actions de melhoria');
    lines.push('- `geracao-testes` → reforçar cobertura e cenários de borda quando os achados apontarem falhas de teste.');
    lines.push('- `quality-contract` → validar type-check, lint e testes antes de avançar de gate.');
    lines.push('- `crap-gate` → investigar hotspots de risco quando os mesmos findings voltarem a aparecer.');

    stream.markdown(lines.join('\n') + '\n');
    emitContextualCommands(stream, [
      { command: '@speckit /history audit 50', description: 'inspecionar a origem dos padrões em audit' },
      { command: '@speckit /metrics', description: 'correlacionar padrões com métricas locais' },
      { command: '@speckit /verify', description: 'executar uma nova rodada determinística de validação' },
    ]);
    emitQuickActions(stream, [
      { title: '🕘 History Audit', query: '@speckit /history audit 50' },
      { title: '📊 Ver Metrics', query: '@speckit /metrics' },
      { title: '✅ Rodar Verify', query: '@speckit /verify' },
    ]);
  } catch (err) {
    handleCommandError(err, stream, 'Erro ao gerar retrospectiva');
  }
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();
}
