import { describe, it, expect } from 'vitest';
import {
  TypecheckValidator,
  parseTscOutput,
  type CommandRunner,
} from '../../../../src/validator/auto/TypecheckValidator';
import type { IFileSystem } from '../../../../src/generator/utils/IFileSystem';
import type { ValidatorContext } from '../../../../src/validator/auto/types';

const fs: IFileSystem = {
  ensureDir: async () => {},
  writeFile: async () => {},
  readFile: async () => '',
  fileExists: async () => false,
  listDir: async () => [],
  deleteFile: async () => {},
  deleteDir: async () => {},
};

function ctx(over: Partial<ValidatorContext>): ValidatorContext {
  return { workspaceRoot: '/ws', fs, ...over };
}

function mockRunner(result: { stdout?: string; stderr?: string; exitCode?: number }): {
  runner: CommandRunner;
  calls: Array<{ command: string; args: readonly string[]; cwd: string }>;
} {
  const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
  const runner: CommandRunner = async (command, args, cwd) => {
    calls.push({ command, args, cwd });
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.exitCode ?? 0,
    };
  };
  return { runner, calls };
}

describe('parseTscOutput', () => {
  it('parses canonical tsc error lines', () => {
    const out = [
      "src/a.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/b.ts(1,1): error TS2304: Cannot find name 'foo'.",
    ].join('\n');
    const parsed = parseTscOutput(out);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      path: 'src/a.ts',
      line: 10,
      column: 5,
      code: 'TS2322',
      severity: 'error',
    });
  });

  it('ignores empty lines and unrelated output', () => {
    const parsed = parseTscOutput('\n\nrandom text\n');
    expect(parsed).toHaveLength(0);
  });

  it('parses warnings as severity warning', () => {
    const parsed = parseTscOutput("foo.ts(2,3): warning TS6133: 'x' is declared but never used.");
    expect(parsed[0]?.severity).toBe('warning');
  });
});

describe('TypecheckValidator', () => {
  it('returns no findings when no story files', async () => {
    const { runner, calls } = mockRunner({});
    const v = new TypecheckValidator({ runner });
    const findings = await v.run(ctx({ storyFiles: [] }));
    expect(findings).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('invokes tsc when there are TS/JS files', async () => {
    const { runner, calls } = mockRunner({ stdout: '', exitCode: 0 });
    const v = new TypecheckValidator({ runner });
    const findings = await v.run(ctx({ storyFiles: ['src/a.ts'] }));
    expect(findings).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('npx');
    expect(calls[0].args).toContain('--noEmit');
    expect(calls[0].cwd).toBe('/ws');
  });

  it('maps tsc errors to findings with path/line', async () => {
    const { runner } = mockRunner({
      stdout: "src/a.ts(7,3): error TS2322: Type 'string' is not assignable to 'number'.",
      exitCode: 1,
    });
    const v = new TypecheckValidator({ runner });
    const findings = await v.run(ctx({ storyFiles: ['src/a.ts'], gateTarget: 2 }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      validator: 'typecheck',
      severity: 'error',
      path: 'src/a.ts',
      line: 7,
    });
    expect(findings[0].message).toContain('TS2322');
  });

  it('emits a fallback finding when tsc fails with non-zero exit and no parseable output', async () => {
    const { runner } = mockRunner({ stdout: 'something exploded', exitCode: 2 });
    const v = new TypecheckValidator({ runner });
    const findings = await v.run(ctx({ storyFiles: ['x.ts'], gateTarget: 2 }));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].metadata?.exitCode).toBe(2);
  });

  it('does not invoke tsc for non-TS story files', async () => {
    const { runner, calls } = mockRunner({});
    const v = new TypecheckValidator({ runner });
    await v.run(ctx({ storyFiles: ['src/A.java', 'app.py'] }));
    expect(calls).toHaveLength(0);
  });

  it('delegates non-TS files to Revisor with stack-specific command', async () => {
    const { runner } = mockRunner({});
    const v = new TypecheckValidator({ runner });
    const findings = await v.run(
      ctx({ storyFiles: ['src/A.java', 'app.py', 'main.go', 'Foo.cs', 'M.kt'] }),
    );
    const stacks = findings
      .map((f) => f.delegatedToRevisor?.stack)
      .filter(Boolean)
      .sort();
    expect(stacks).toEqual(['csharp', 'go', 'java', 'kotlin', 'python']);
    for (const f of findings) {
      expect(f.delegatedToRevisor?.command).toBeTruthy();
      expect(f.severity).toBe('info');
    }
  });

  it('runs tsc and delegates mixed stacks in same run', async () => {
    const { runner, calls } = mockRunner({ stdout: '', exitCode: 0 });
    const v = new TypecheckValidator({ runner });
    const findings = await v.run(ctx({ storyFiles: ['a.ts', 'b.py'] }));
    expect(calls).toHaveLength(1);
    expect(findings.filter((f) => f.delegatedToRevisor?.stack === 'python')).toHaveLength(1);
  });

  it('warns (not blocks) when gateTarget < 2 and tsc reports errors', async () => {
    const { runner } = mockRunner({
      stdout: "src/a.ts(1,1): error TS2304: Cannot find name 'foo'.",
      exitCode: 1,
    });
    const v = new TypecheckValidator({ runner });
    const findings = await v.run(ctx({ storyFiles: ['src/a.ts'], gateTarget: 1 }));
    expect(findings[0].severity).toBe('warn');
  });
});
