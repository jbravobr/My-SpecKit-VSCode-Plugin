import { performance } from 'node:perf_hooks';

export interface BudgetCheck {
  name: string;
  budgetMs: number;
  measuredMs: number;
  exceeded: boolean;
}

interface BudgetMetricEvent {
  name: 'graph.budget.exceeded';
  value: number;
  tags: { check: string };
}

interface BudgetMetricsRecorder {
  record(event: BudgetMetricEvent): unknown;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as { then: unknown }).then === 'function'
  );
}

function createCheck(name: string, budgetMs: number, startedAt: number): BudgetCheck {
  const measuredMs = performance.now() - startedAt;
  return {
    name,
    budgetMs,
    measuredMs,
    exceeded: measuredMs > budgetMs,
  };
}

/**
 * Default graph performance budgets (config keys):
 * - graph.gate.ensure: 300ms (`speckit.graph.gate.budgetMs`)
 * - graph.updater.flush: 2000ms (`speckit.graph.updater.flush.budgetMs`)
 * - graph.embedder.generate: 50ms (`speckit.graph.embedder.generate.budgetMs`)
 */
export class PerfBudget {
  private static metricsRecorder: BudgetMetricsRecorder | undefined;

  static setMetricsRecorder(recorder: BudgetMetricsRecorder | undefined): void {
    this.metricsRecorder = recorder;
  }

  static async measure<T>(
    name: string,
    budgetMs: number,
    fn: () => Promise<T>,
  ): Promise<{ result: T; check: BudgetCheck }> {
    const startedAt = performance.now();
    const result = await fn();
    const check = createCheck(name, budgetMs, startedAt);
    this.emitIfExceeded(check);
    return { result, check };
  }

  static measureSync<T>(
    name: string,
    budgetMs: number,
    fn: () => T,
  ): { result: T; check: BudgetCheck } {
    const startedAt = performance.now();
    const result = fn();
    const check = createCheck(name, budgetMs, startedAt);
    this.emitIfExceeded(check);
    return { result, check };
  }

  private static emitIfExceeded(check: BudgetCheck): void {
    if (!check.exceeded) {
      return;
    }

    const event: BudgetMetricEvent = {
      name: 'graph.budget.exceeded',
      value: check.measuredMs,
      tags: { check: check.name },
    };

    if (this.metricsRecorder !== undefined) {
      try {
        const result = this.metricsRecorder.record(event);
        if (isPromiseLike(result)) {
          void Promise.resolve(result).catch((error: unknown) => {
            console.warn('Unable to record graph budget metric:', error);
          });
        }
        return;
      } catch (error) {
        console.warn('Unable to record graph budget metric:', error);
      }
    }

    console.warn(
      `Graph performance budget exceeded for ${check.name}: ${check.measuredMs.toFixed(1)}ms > ${check.budgetMs}ms`,
    );
  }
}
