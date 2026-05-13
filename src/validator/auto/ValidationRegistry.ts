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
    const timeoutMs = opts.timeoutMs;

    const findings: Finding[] = [];
    const perValidator: ValidatorExecutionStat[] = [];

    const queue = [...selected];
    const workers: Promise<void>[] = [];
    const workerCount = Math.min(concurrency, queue.length);

    for (let i = 0; i < workerCount; i++) {
      workers.push(this.runWorker(queue, ctx, findings, perValidator, timeoutMs));
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
    timeoutMs?: number,
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
      const localAbort = new AbortController();
      const parentSignal = ctx.signal;
      const onParentAbort = (): void => localAbort.abort();
      if (parentSignal) parentSignal.addEventListener('abort', onParentAbort);
      const innerCtx: ValidatorContext = { ...ctx, signal: localAbort.signal };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<Finding[]>((resolve) => {
        if (typeof timeoutMs === 'number' && timeoutMs > 0) {
          timer = setTimeout(() => {
            localAbort.abort();
            resolve([
              {
                validator: validator.id,
                severity: 'error',
                message: `Validator '${validator.id}' excedeu timeout de ${timeoutMs}ms e foi abortado.`,
                metadata: { timeoutMs },
              } as Finding,
            ]);
          }, timeoutMs);
        }
      });
      try {
        const racedResult =
          typeof timeoutMs === 'number' && timeoutMs > 0
            ? await Promise.race([validator.run(innerCtx), timeoutPromise])
            : await validator.run(innerCtx);
        const result = racedResult;
        findings.push(...result);
        perValidator.push({
          id: validator.id,
          durationMs: Date.now() - validatorStart,
          findingCount: result.length,
          error: result.some((f) =>
            f.message.startsWith(`Validator '${validator.id}' excedeu timeout`),
          )
            ? 'timeout'
            : undefined,
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
      } finally {
        if (timer) clearTimeout(timer);
        if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
      }
    }
  }
}
