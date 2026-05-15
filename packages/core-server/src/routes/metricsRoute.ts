import { Router, Request, Response } from 'express';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { MetricsSummary, MetricsRecorder, summarize } from '../../../../src/workflow/MetricsRecorder';

const router = Router();

function formatRate(r: number): string {
  return `${(r * 100).toFixed(1)}%`;
}

export function buildMetricsMarkdown(summary: MetricsSummary): string {
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
  const byTypeLine =
    Object.entries(summary.byType)
      .map(([t, n]) => `\`${t}\`: ${n}`)
      .join(' · ') || '_(nenhum)_';

  return (
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
    `_Arquivo bruto: \`.speckit/metrics/events.jsonl\`_\n`
  );
}

router.get('/metrics', async (req: Request, res: Response) => {
  const workspaceRoot = req.query.workspaceRoot as string;
  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  try {
    const recorder = new MetricsRecorder(nodeFileSystem, workspaceRoot);
    const events = await recorder.readAll();
    if (events.length === 0) {
      res.json({
        total: 0,
        markdown:
          '📊 **Métricas SpecKit** — sem eventos registrados ainda.\n\n' +
          'As métricas são registradas automaticamente em `.speckit/metrics/events.jsonl` quando você roda `/verify`, transições de gate, hooks pós-save ou heurística de spec.\n',
      });
      return;
    }

    const summary = summarize(events);
    res.json({
      total: events.length,
      summary,
      markdown: buildMetricsMarkdown(summary),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
