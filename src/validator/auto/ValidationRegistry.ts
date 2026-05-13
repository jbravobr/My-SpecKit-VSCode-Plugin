import { createCorrelationId } from '../../workflow/ObservabilityContext';
import {
  Finding,
  RunOptions,
  ValidationReport,
  Validator,
  ValidatorContext,
  ValidatorExecutionStat,
  isBlocking,
} from './types';

const DEFAULT_CONCURRENCY = 4;

export class ValidationRegistry {
  private readonly validators = new Map<string, Validator>();

  register(validator: Validator): void {
    if (!validator.id) {
      throw new Error('Validator must declare a non-empty id');
    }
    if (this.validators.has(validator.id)) {
      throw new Error(`Validator already registered: '${validator.id}'`);
    }
    this.validators.set(validator.id, validator);
  }

  unregister(id: string): void {
    this.validators.delete(id);
  }

  has(id: string): boolean {
    return this.validators.has(id);
  }

  list(): Validator[] {
    return Array.from(this.validators.values());
  }

  async run(ctx: ValidatorContext, opts: RunOptions = {}): Promise<ValidationReport> {
    const runId = createCorrelationId('exec');
    const startedAt = Date.now();
    const selected = this.selectValidators(opts.only);
    const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);

    const findings: Finding[] = [];
    const perValidator: ValidatorExecutionStat[] = [];

    const queue = [...selected];
    const workers: Promise<void>[] = [];
    const workerCount = Math.min(concurrency, queue.length);

    for (let i = 0; i < workerCount; i++) {
      workers.push(this.runWorker(queue, ctx, findings, perValidator));
    }

    await Promise.all(workers);

    const durationMs = Date.now() - startedAt;
    const passed = !findings.some(isBlocking);

    return {
      runId,
      gateTarget: ctx.gateTarget,
      findings,
      passed,
      durationMs,
      perValidator,
    };
  }

  private selectValidators(only?: string[]): Validator[] {
    const all = this.list();
    if (!only || only.length === 0) return all;
    const allowed = new Set(only);
    return all.filter((v) => allowed.has(v.id));
  }

  private async runWorker(
    queue: Validator[],
    ctx: ValidatorContext,
    findings: Finding[],
    perValidator: ValidatorExecutionStat[],
  ): Promise<void> {
    while (queue.length > 0) {
      const validator = queue.shift();
      if (!validator) break;
      if (ctx.signal?.aborted) {
        perValidator.push({
          id: validator.id,
          durationMs: 0,
          findingCount: 0,
          error: 'aborted',
        });
        continue;
      }

      const validatorStart = Date.now();
      try {
        const result = await validator.run(ctx);
        findings.push(...result);
        perValidator.push({
          id: validator.id,
          durationMs: Date.now() - validatorStart,
          findingCount: result.length,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        findings.push({
          validator: validator.id,
          severity: 'error',
          message: `Validator '${validator.id}' threw: ${message}`,
        });
        perValidator.push({
          id: validator.id,
          durationMs: Date.now() - validatorStart,
          findingCount: 0,
          error: message,
        });
      }
    }
  }
}
