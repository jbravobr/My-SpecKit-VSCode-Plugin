import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerfBudget } from '../../../src/graph/PerfBudget';

describe('PerfBudget', () => {
  afterEach(() => {
    PerfBudget.setMetricsRecorder(undefined);
    vi.restoreAllMocks();
  });

  it('returns a non-exceeded check when async work stays within budget', async () => {
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result, check } = await PerfBudget.measure('graph.test.ok', 10_000, async () => 'ok');

    expect(result).toBe('ok');
    expect(check.name).toBe('graph.test.ok');
    expect(check.budgetMs).toBe(10_000);
    expect(check.measuredMs).toBeGreaterThanOrEqual(0);
    expect(check.exceeded).toBe(false);
    expect(warningSpy).not.toHaveBeenCalled();
  });

  it('emits a warning when the budget is exceeded without a metrics recorder', () => {
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result, check } = PerfBudget.measureSync('graph.test.exceeded', -1, () => 42);

    expect(result).toBe(42);
    expect(check.exceeded).toBe(true);
    expect(warningSpy).toHaveBeenCalledWith(
      expect.stringContaining('Graph performance budget exceeded for graph.test.exceeded'),
    );
  });

  it('measureSync returns the function result and budget check', () => {
    const { result, check } = PerfBudget.measureSync('graph.test.sync', 10_000, () => ({
      ok: true,
    }));

    expect(result).toEqual({ ok: true });
    expect(check.name).toBe('graph.test.sync');
    expect(check.exceeded).toBe(false);
  });
});
