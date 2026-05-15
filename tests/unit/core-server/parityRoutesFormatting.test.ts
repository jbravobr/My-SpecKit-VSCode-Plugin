import { describe, expect, it } from 'vitest';
import { MetricsSummary } from '../../../src/workflow/MetricsRecorder';
import { scoreStory } from '../../../src/workflow/SpecCompletenessScorer';
import { buildMetricsMarkdown } from '../../../packages/core-server/src/routes/metricsRoute';
import { buildScoreMarkdown, levelEmoji } from '../../../packages/core-server/src/routes/scoreRoute';
import { resolveVerifyTargetGate } from '../../../packages/core-server/src/routes/verifyRoute';
import { renderGateInfo } from '../../../packages/core-server/src/routes/validateRoute';

describe('core-server parity routes formatting', () => {
  it('buildMetricsMarkdown renders key summary sections', () => {
    const summary: MetricsSummary = {
      total: 4,
      byType: { 'verify-command': 2, 'gate-verification': 2 },
      byGate: { '2': 1, '3': 3 },
      bySpec: { '001': 3, '002': 1 },
      avgDurationMs: 120,
      medianDurationMs: 100,
      p95DurationMs: 200,
      passRate: 0.75,
      blockingFindings: 2,
      topValidators: [{ id: 'typecheck', runs: 4 }],
      rangeFrom: '2026-05-15T09:00:00.000Z',
      rangeTo: '2026-05-15T10:00:00.000Z',
    };

    const markdown = buildMetricsMarkdown(summary);
    expect(markdown).toContain('## 📊 Métricas SpecKit');
    expect(markdown).toContain('Pass rate:** 75.0%');
    expect(markdown).toContain('`verify-command`: 2');
    expect(markdown).toContain('Gate 3: 3');
  });

  it('buildScoreMarkdown renders score table and recommendations', () => {
    const report: ReturnType<typeof scoreStory> = {
      score: 82,
      level: 'alta',
      breakdown: [
        { key: 'metadata', label: 'Metadata', weight: 10, earned: 8 },
        { key: 'functional', label: 'Spec funcional', weight: 20, earned: 18 },
      ],
      recommendations: ['Adicionar critérios de aceite para edge cases.'],
    };

    const markdown = buildScoreMarkdown('001', report);
    expect(markdown).toContain('Score da Spec — `STORY-001`');
    expect(markdown).toContain('| Dimensão | Peso | Obtido |');
    expect(markdown).toContain('### Recomendações para subir o score:');
    expect(levelEmoji('alta')).toBe('✅');
  });

  it('resolveVerifyTargetGate follows explicit or next-gate policy', () => {
    expect(resolveVerifyTargetGate(2)).toBe(3);
    expect(resolveVerifyTargetGate(4)).toBe(4);
    expect(resolveVerifyTargetGate(1, 0)).toBe(0);
  });

  it('renderGateInfo maps current and next gate labels', () => {
    expect(renderGateInfo(2)).toContain('Gate atual:** 2 — Testes');
    expect(renderGateInfo(2)).toContain('Próximo:** 3 — Revisão');
    expect(renderGateInfo(4)).toContain('Próximo:** nenhum');
  });
});
