import * as path from 'path';
import { execFile } from 'child_process';
import type { Finding, Validator, ValidatorContext } from './types';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
  signal?: AbortSignal,
) => Promise<ProcessResult>;

export interface TestExecutionValidatorOptions {
  runner?: CommandRunner;
  stackCommands?: Record<string, { command: string; args: readonly string[] }>;
}

const TS_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;

const NON_TS_STACK: Record<string, { command: string; args: readonly string[] }> = {
  java: { command: 'mvn', args: ['-B', '-q', 'test'] },
  kotlin: { command: 'gradle', args: ['-q', 'test'] },
  python: { command: 'pytest', args: ['-q'] },
  csharp: { command: 'dotnet', args: ['test', '--nologo', '--verbosity:quiet'] },
  go: { command: 'go', args: ['test', './...'] },
};

const defaultRunner: CommandRunner = (command, args, cwd, signal) =>
  new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { cwd, signal, maxBuffer: 1024 * 1024 * 20, windowsHide: true },
      (err, stdout, stderr) => {
        const exitCode =
          err && typeof (err as { code?: unknown }).code === 'number'
            ? ((err as { code: number }).code as number)
            : err
              ? 1
              : 0;
        resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), exitCode });
      },
    );
  });

export class TestExecutionValidator implements Validator {
  readonly id = 'test-execution';
  readonly description =
    'Runs the test suite scoped to the story files (vitest related when TS/JS).';

  private readonly runner: CommandRunner;
  private readonly stackCommands: Record<string, { command: string; args: readonly string[] }>;

  constructor(options: TestExecutionValidatorOptions = {}) {
    this.runner = options.runner ?? defaultRunner;
    this.stackCommands = { ...NON_TS_STACK, ...(options.stackCommands ?? {}) };
  }

  async run(ctx: ValidatorContext): Promise<Finding[]> {
    const files = ctx.storyFiles ?? [];
    if (files.length === 0) return [];

    const tsFiles = files.filter((f) => TS_EXT.test(f));
    const nonTs = files.filter((f) => !TS_EXT.test(f));
    const findings: Finding[] = [];

    if (tsFiles.length > 0) {
      findings.push(...(await this.runVitest(tsFiles, ctx)));
    }

    findings.push(...this.delegateNonTs(nonTs, ctx));
    return findings;
  }

  private async runVitest(tsFiles: string[], ctx: ValidatorContext): Promise<Finding[]> {
    const target = ctx.gateTarget ?? 3;
    const blocking = target >= 3;
    const { safeFiles, rejectedFiles } = normalizeVitestTargetFiles(tsFiles, ctx.workspaceRoot);
    const rejectedFindings = rejectedFiles.map<Finding>((file) => ({
      validator: this.id,
      severity: blocking ? 'error' : 'warn',
      message: `Arquivo inválido para execução de testes relacionados: ${file}`,
      gateTarget: ctx.gateTarget,
      metadata: { reason: 'unsafe-path-or-option-like' },
    }));

    if (safeFiles.length === 0) {
      return rejectedFindings;
    }

    const { stdout, stderr, exitCode } = await this.runner(
      'npx',
      ['--no-install', 'vitest', 'related', '--run', '--reporter=basic', ...safeFiles],
      ctx.workspaceRoot,
      ctx.signal,
    );
    if (exitCode === 0) return rejectedFindings;

    const failures = parseVitestFailures(`${stdout}\n${stderr}`);
    if (failures.length === 0) {
      return [
        ...rejectedFindings,
        {
          validator: this.id,
          severity: blocking ? 'error' : 'warn',
          message: `vitest terminou com código ${exitCode} sem falhas parseáveis.`,
          gateTarget: ctx.gateTarget,
          metadata: { exitCode, stdout: truncate(stdout), stderr: truncate(stderr) },
        },
      ];
    }
    return [
      ...rejectedFindings,
      ...failures.map<Finding>((f) => ({
        validator: this.id,
        severity: blocking ? 'error' : 'warn',
        message: `Teste falhou: ${f.title}`,
        gateTarget: ctx.gateTarget,
        path: f.file,
        suggestedFix:
          'Implementador deve corrigir comportamento ou ajustar o teste se a expectativa estiver incorreta.',
        metadata: { title: f.title },
      })),
    ];
  }

  private delegateNonTs(files: string[], ctx: ValidatorContext): Finding[] {
    const byStack = new Map<string, string[]>();
    for (const f of files) {
      const stack = stackForFile(f);
      if (!stack) continue;
      if (!byStack.has(stack)) byStack.set(stack, []);
      byStack.get(stack)!.push(f);
    }
    const out: Finding[] = [];
    for (const [stack, list] of byStack) {
      const cmd = this.stackCommands[stack];
      if (!cmd) continue;
      out.push({
        validator: this.id,
        severity: 'info',
        message: `Execução de testes nativa indisponível para stack "${stack}"; delegando ao Revisor.`,
        gateTarget: ctx.gateTarget,
        delegatedToRevisor: {
          reason: `Plugin não executa toolchain ${stack}; Revisor deve rodar comando e reportar achados.`,
          command: [cmd.command, ...cmd.args].join(' '),
          stack,
        },
        metadata: { stack, files: list },
      });
    }
    return out;
  }
}

export function parseVitestFailures(output: string): Array<{ title: string; file?: string }> {
  const results: Array<{ title: string; file?: string }> = [];
  let currentFile: string | undefined;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Heuristic: lines like "FAIL  tests/foo.test.ts > suite > case"
    const m = /^FAIL\s+(?<file>\S+?)(?:\s+>\s+(?<title>.+))?$/.exec(line);
    if (m?.groups) {
      currentFile = m.groups.file;
      if (m.groups.title) {
        results.push({ title: m.groups.title, file: currentFile });
      } else {
        results.push({ title: m.groups.file, file: currentFile });
      }
      continue;
    }
    // Alternative format: "× tests/foo.test.ts > case" (verbose reporter)
    const m2 = /^[×x✗]\s+(?<file>\S+?)\s+>\s+(?<title>.+)$/.exec(line);
    if (m2?.groups) {
      results.push({ title: m2.groups.title, file: m2.groups.file });
    }
  }
  return results;
}

function stackForFile(file: string): string | undefined {
  const ext = file.match(/\.([a-z]+)$/i)?.[1]?.toLowerCase();
  if (!ext) return undefined;
  if (ext === 'java') return 'java';
  if (ext === 'kt') return 'kotlin';
  if (ext === 'py') return 'python';
  if (ext === 'cs') return 'csharp';
  if (ext === 'go') return 'go';
  return undefined;
}

function truncate(s: string, n = 800): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function normalizeVitestTargetFiles(
  files: string[],
  workspaceRoot: string,
): { safeFiles: string[]; rejectedFiles: string[] } {
  const safeFiles: string[] = [];
  const rejectedFiles: string[] = [];

  for (const file of files) {
    const resolved = path.resolve(workspaceRoot, file);
    const relative = path.relative(workspaceRoot, resolved);
    const escapedWorkspace = relative.startsWith('..') || path.isAbsolute(relative);
    const normalized = relative.replace(/\\/g, '/');
    const base = path.basename(normalized);

    if (escapedWorkspace || base.startsWith('-') || normalized.length === 0) {
      rejectedFiles.push(file);
      continue;
    }

    safeFiles.push(normalized.startsWith('./') ? normalized : `./${normalized}`);
  }

  return { safeFiles, rejectedFiles };
}
