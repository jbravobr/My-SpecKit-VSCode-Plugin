import * as vscode from 'vscode';
import type { IFileSystem } from '../../generator/utils/IFileSystem';
import type { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { MetricsRecorder, summarize } from '../../workflow/MetricsRecorder';
import { handleCommandError, requireWorkspace } from './CommandHelpers';

function formatRate(r: number): string {
  return `${(r * 100).toFixed(1)}%`;
}

export async function handleMetricsCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  try {
    const recorder = new MetricsRecorder(fs, workspaceRoot);
    const events = await recorder.readAll();
    if (events.length === 0) {
      stream.markdown(
        '📊 **Métricas SpecKit** — sem eventos registrados ainda.\n\n' +
          'As métricas são registradas automaticamente em `.speckit/metrics/events.jsonl` quando você roda `/verify`, transições de gate, hooks pós-save ou heurística de spec.\n',
      );
      return;
    }
    const summary = summarize(events);
    const validatorsLine =
      summary.topValidators.length === 0
        ? '_(nenhum validador executado)_'
        : summary.topValidators.map((v) => `\`${v.id}\` (${v.runs})`).join(', ');
    const byGateLine =
      Object.keys(summary.byGate).length === 0
        ? '_(nenhum)_'
        : Object.entries(summary.byGate)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([g, n]) => `Gate ${g}: ${n}`)
            .join(' · ');
    const byTypeLine = Object.entries(summary.byType)
      .map(([t, n]) => `\`${t}\`: ${n}`)
      .join(' · ');

    stream.markdown(
      `## 📊 Métricas SpecKit\n\n` +
        `**Período:** ${summary.rangeFrom ?? '?'} → ${summary.rangeTo ?? '?'}\n` +
        `**Eventos:** ${summary.total} · **Pass rate:** ${formatRate(summary.passRate)} · **Findings bloqueantes acumulados:** ${summary.blockingFindings}\n\n` +
        `**Duração (ms):** avg=${summary.avgDurationMs} · median=${summary.medianDurationMs} · p95=${summary.p95DurationMs}\n\n` +
        `**Por tipo:** ${byTypeLine}\n\n` +
        `**Por gate:** ${byGateLine}\n\n` +
        `**Validadores mais executados:** ${validatorsLine}\n\n` +
        `**Specs com mais eventos:** ${
          Object.keys(summary.bySpec).length === 0
            ? '_(nenhuma)_'
            : Object.entries(summary.bySpec)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([s, n]) => `\`${s}\` (${n})`)
                .join(', ')
        }\n\n` +
        `_Arquivo bruto: \`.speckit/metrics/events.jsonl\`_\n`,
    );
  } catch (err: unknown) {
    handleCommandError(err, stream, 'Erro ao ler métricas');
  }
}
