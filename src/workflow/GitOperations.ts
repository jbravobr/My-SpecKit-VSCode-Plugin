import { execFile } from 'child_process';

export interface IGitOps {
  diff(cwd: string, full: boolean): Promise<string>;
  commit(cwd: string, message: string): Promise<string>;
  hasChanges(cwd: string): Promise<boolean>;
  isRepository(cwd: string): Promise<boolean>;
  init(cwd: string): Promise<string>;
  changedFiles?(cwd: string, range?: string): Promise<string[]>;
}

const MAX_OUTPUT_BYTES = 50 * 1024; // 50KB
const TIMEOUT_MS = 10_000;

function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES + 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = stderr?.trim() || err.message;
          reject(new Error(msg));
          return;
        }
        const output = stdout ?? '';
        if (output.length > MAX_OUTPUT_BYTES) {
          resolve(
            output.slice(0, MAX_OUTPUT_BYTES) +
              '\n\n(truncado — use `git diff` no terminal para ver completo)',
          );
        } else {
          resolve(output);
        }
      },
    );
  });
}

function isNotGitRepositoryError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.toLowerCase().includes('not a git repository');
}

export const gitOps: IGitOps = {
  async diff(cwd: string, full: boolean): Promise<string> {
    const args = full ? ['diff', 'HEAD'] : ['diff', 'HEAD', '--stat'];
    return execGit(args, cwd);
  },

  async commit(cwd: string, message: string): Promise<string> {
    await execGit(['add', '-A'], cwd);
    return execGit(['commit', '-m', message], cwd);
  },

  async hasChanges(cwd: string): Promise<boolean> {
    const status = await execGit(['status', '--porcelain'], cwd);
    return status.trim().length > 0;
  },

  async isRepository(cwd: string): Promise<boolean> {
    try {
      const output = await execGit(['rev-parse', '--is-inside-work-tree'], cwd);
      return output.trim() === 'true';
    } catch (err: unknown) {
      if (isNotGitRepositoryError(err)) return false;
      throw err;
    }
  },

  async init(cwd: string): Promise<string> {
    return execGit(['init'], cwd);
  },

  async changedFiles(cwd: string, range = 'develop...HEAD'): Promise<string[]> {
    try {
      const output = await execGit(['diff', '--name-only', range], cwd);
      return output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    } catch (err: unknown) {
      // Fallback for repositories without local develop branch.
      if (range === 'develop...HEAD') {
        const output = await execGit(['diff', '--name-only', 'HEAD'], cwd);
        return output
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
      }
      throw err;
    }
  },
};
