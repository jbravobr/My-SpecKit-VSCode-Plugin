import { describe, it, expect } from 'vitest';
import {
  TestExecutionValidator,
  parseVitestFailures,
  type CommandRunner,
} from '../../../../src/validator/auto/TestExecutionValidator';
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
  calls: Array<{ command: string; args: readonly string[] }>;
} {
  const calls: Array<{ command: string; args: readonly string[] }> = [];
  const runner: CommandRunner = async (command, args) => {
    calls.push({ command, args });
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.exitCode ?? 0,
    };
  };
  return { runner, calls };
}

describe('parseVitestFailures', () => {
  it('parses FAIL lines with suite > case', () => {
    const out =
      'FAIL  tests/a.test.ts > MyModule > should add\nFAIL  tests/b.test.ts > Other > xyz';
    const parsed = parseVitestFailures(out);
    expect(parsed).toEqual([
      { title: 'MyModule > should add', file: 'tests/a.test.ts' },
      { title: 'Other > xyz', file: 'tests/b.test.ts' },
    ]);
  });

  it('returns empty for clean output', () => {
    expect(parseVitestFailures('all green\nTest Files  5 passed')).toEqual([]);
  });

  it('parses verbose × marker format', () => {
    const out = '× tests/a.test.ts > should fail something';
    expect(parseVitestFailures(out)).toEqual([
      { title: 'should fail something', file: 'tests/a.test.ts' },
    ]);
  });
});

describe('TestExecutionValidator', () => {
  it('returns no findings when storyFiles is empty', async () => {
    const { runner, calls } = mockRunner({});
    const v = new TestExecutionValidator({ runner });
    expect(await v.run(ctx({ storyFiles: [] }))).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('invokes vitest related for TS files', async () => {
    const { runner, calls } = mockRunner({ exitCode: 0 });
    const v = new TestExecutionValidator({ runner });
    const findings = await v.run(ctx({ storyFiles: ['src/a.ts', 'src/b.ts'] }));
    expect(findings).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('npx');
    expect(calls[0].args).toContain('related');
    expect(calls[0].args).toContain('./src/a.ts');
    expect(calls[0].args).toContain('./src/b.ts');
    expect(calls[0].args.indexOf('--run')).toBeLessThan(calls[0].args.indexOf('./src/a.ts'));
  });

  it('maps vitest failures to findings', async () => {
    const { runner } = mockRunner({
      stdout: 'FAIL  tests/foo.test.ts > Foo > bar\nFAIL  tests/baz.test.ts > Baz > qux',
      exitCode: 1,
    });
    const v = new TestExecutionValidator({ runner });
    const findings = await v.run(ctx({ storyFiles: ['src/foo.ts'], gateTarget: 3 }));
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      validator: 'test-execution',
      severity: 'error',
      path: 'tests/foo.test.ts',
    });
  });

  it('emits fallback finding when exit non-zero with no parseable failures', async () => {
    const { runner } = mockRunner({ stdout: 'cryptic error', exitCode: 2 });
    const v = new TestExecutionValidator({ runner });
    const findings = await v.run(ctx({ storyFiles: ['src/a.ts'], gateTarget: 3 }));
    expect(findings).toHaveLength(1);
    expect(findings[0].metadata?.exitCode).toBe(2);
    expect(findings[0].severity).toBe('error');
  });

  it('downgrades to warn when gateTarget < 3', async () => {
    const { runner } = mockRunner({
      stdout: 'FAIL  tests/a.test.ts > x > y',
      exitCode: 1,
    });
    const v = new TestExecutionValidator({ runner });
    const findings = await v.run(ctx({ storyFiles: ['src/a.ts'], gateTarget: 2 }));
    expect(findings[0].severity).toBe('warn');
  });

  it('delegates non-TS stacks to Revisor with appropriate command', async () => {
    const { runner, calls } = mockRunner({});
    const v = new TestExecutionValidator({ runner });
    const findings = await v.run(
      ctx({ storyFiles: ['App.java', 'main.py', 'svc.go', 'Foo.cs', 'M.kt'] }),
    );
    expect(calls).toHaveLength(0);
    const stacks = findings.map((f) => f.delegatedToRevisor?.stack).sort();
    expect(stacks).toEqual(['csharp', 'go', 'java', 'kotlin', 'python']);
    for (const f of findings) {
      expect(f.severity).toBe('info');
      expect(f.delegatedToRevisor?.command).toContain('test');
    }
  });

  it('runs vitest and delegates mixed stacks', async () => {
    const { runner, calls } = mockRunner({ exitCode: 0 });
    const v = new TestExecutionValidator({ runner });
    const findings = await v.run(ctx({ storyFiles: ['a.ts', 'b.py'] }));
    expect(calls).toHaveLength(1);
    expect(findings.filter((f) => f.delegatedToRevisor?.stack === 'python')).toHaveLength(1);
  });

  it('blocks option-like file names from vitest arguments', async () => {
    const { runner, calls } = mockRunner({ exitCode: 0 });
    const v = new TestExecutionValidator({ runner });
    const findings = await v.run(ctx({ storyFiles: ['-evil.ts'], gateTarget: 3 }));

    expect(calls).toHaveLength(0);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].metadata?.reason).toBe('unsafe-path-or-option-like');
  });

  it('rejects files that escape workspace root', async () => {
    const { runner, calls } = mockRunner({ exitCode: 0 });
    const v = new TestExecutionValidator({ runner });
    const findings = await v.run(ctx({ storyFiles: ['../outside.ts'], gateTarget: 3 }));

    expect(calls).toHaveLength(0);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('../outside.ts');
  });
});
