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

export interface TypecheckValidatorOptions {
  runner?: CommandRunner;
  stackCommands?: Record<string, { command: string; args: readonly string[] }>;
}

const TS_EXT = /\.(ts|tsx|mts|cts)$/i;
const JS_EXT = /\.(js|jsx|mjs|cjs)$/i;
const NON_TS_STACK: Record<string, { command: string; args: readonly string[] }> = {
  java: { command: 'mvn', args: ['-B', '-q', 'compile'] },
  kotlin: { command: 'gradle', args: ['-q', 'compileKotlin'] },
  python: { command: 'pyright', args: ['.'] },
  csharp: { command: 'dotnet', args: ['build', '-nologo', '/clp:ErrorsOnly'] },
  go: { command: 'go', args: ['build', './...'] },
};

const TS_ERROR_RE =
  /^(?<path>[^()]+?)\((?<line>\d+),(?<col>\d+)\):\s*(?<sev>error|warning)\s+(?<code>TS\d+):\s*(?<msg>.+)$/i;

export function parseTscOutput(output: string): Array<{
  path: string;
  line: number;
  column: number;
  code: string;
  severity: 'error' | 'warning';
  message: string;
}> {
  const items: Array<{
    path: string;
    line: number;
    column: number;
    code: string;
    severity: 'error' | 'warning';
    message: string;
  }> = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = TS_ERROR_RE.exec(line);
    if (!m?.groups) continue;
    items.push({
      path: m.groups.path,
      line: Number(m.groups.line),
      column: Number(m.groups.col),
      code: m.groups.code,
      severity: m.groups.sev.toLowerCase() === 'warning' ? 'warning' : 'error',
      message: m.groups.msg,
    });
  }
  return items;
}

const defaultRunner: CommandRunner = (command, args, cwd, signal) =>
  new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { cwd, signal, maxBuffer: 1024 * 1024 * 10, windowsHide: true },
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

export class TypecheckValidator implements Validator {
  readonly id = 'typecheck';
  readonly description = 'Validates static typing for the story files (tsc --noEmit when TS/JS).';

  private readonly runner: CommandRunner;
  private readonly stackCommands: Record<string, { command: string; args: readonly string[] }>;

  constructor(options: TypecheckValidatorOptions = {}) {
    this.runner = options.runner ?? defaultRunner;
    this.stackCommands = { ...NON_TS_STACK, ...(options.stackCommands ?? {}) };
  }

  async run(ctx: ValidatorContext): Promise<Finding[]> {
    const files = ctx.storyFiles ?? [];
    const tsFiles = files.filter((f) => TS_EXT.test(f) || JS_EXT.test(f));
    const nonTsFiles = files.filter((f) => !TS_EXT.test(f) && !JS_EXT.test(f));
    const findings: Finding[] = [];

    if (tsFiles.length > 0) {
      findings.push(...(await this.runTsc(ctx)));
    }

    if (nonTsFiles.length > 0) {
      findings.push(...this.delegateNonTs(nonTsFiles, ctx));
    }

    return findings;
  }

  private async runTsc(ctx: ValidatorContext): Promise<Finding[]> {
    const { stdout, stderr, exitCode } = await this.runner(
      'npx',
      ['--no-install', 'tsc', '--noEmit', '--pretty', 'false'],
      ctx.workspaceRoot,
      ctx.signal,
    );
    const errors = parseTscOutput(`${stdout}\n${stderr}`);
    const target = ctx.gateTarget ?? 2;
    const blocking = target >= 2;
    if (errors.length === 0) {
      if (exitCode !== 0) {
        return [
          {
            validator: this.id,
            severity: blocking ? 'error' : 'warn',
            message: `tsc terminou com código ${exitCode} sem diagnósticos parseáveis.`,
            gateTarget: ctx.gateTarget,
            metadata: { exitCode, stdout: truncate(stdout), stderr: truncate(stderr) },
          },
        ];
      }
      return [];
    }
    return errors.map<Finding>((e) => ({
      validator: this.id,
      severity: e.severity === 'warning' ? 'warn' : blocking ? 'error' : 'warn',
      message: `${e.code}: ${e.message}`,
      gateTarget: ctx.gateTarget,
      path: e.path,
      line: e.line,
      suggestedFix: 'Corrigir tipo / import / contrato apontado por TypeScript.',
      metadata: { column: e.column, code: e.code },
    }));
  }

  private delegateNonTs(files: string[], ctx: ValidatorContext): Finding[] {
    const byStack = new Map<string, string[]>();
    for (const f of files) {
      const stack = stackForFile(f);
      if (!stack) continue;
      if (!byStack.has(stack)) byStack.set(stack, []);
      byStack.get(stack)!.push(f);
    }
    const result: Finding[] = [];
    for (const [stack, list] of byStack) {
      const cmd = this.stackCommands[stack];
      if (!cmd) continue;
      result.push({
        validator: this.id,
        severity: 'info',
        message: `Typecheck nativo indisponível para stack "${stack}"; delegando ao Revisor.`,
        gateTarget: ctx.gateTarget,
        delegatedToRevisor: {
          reason: `Plugin não executa toolchain ${stack}; Revisor deve rodar comando e reportar achados.`,
          command: [cmd.command, ...cmd.args].join(' '),
          stack,
        },
        metadata: { stack, files: list },
      });
    }
    return result;
  }
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
