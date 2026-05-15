import { describe, expect, it } from 'vitest';
import {
  SecretLeakValidator,
  DEFAULT_SECRET_RULES,
} from '../../../../src/validator/auto/SecretLeakValidator';
import type { IFileSystem } from '../../../../src/generator/utils/IFileSystem';
import type { ValidatorContext } from '../../../../src/validator/auto/types';

function memoryFs(files: Record<string, string>): IFileSystem {
  return {
    ensureDir: async () => {},
    writeFile: async () => {},
    readFile: async (p) => {
      if (!(p in files)) throw new Error('not found: ' + p);
      return files[p];
    },
    fileExists: async (p) => p in files,
    listDir: async () => Object.keys(files),
    deleteFile: async () => {},
    deleteDir: async () => {},
  };
}

function ctx(fs: IFileSystem, storyFiles: string[]): ValidatorContext {
  return { workspaceRoot: '/ws', fs, storyFiles };
}

describe('SecretLeakValidator', () => {
  it('returns no findings when there are no story files', async () => {
    const v = new SecretLeakValidator();
    const f = await v.run(ctx(memoryFs({}), []));
    expect(f).toEqual([]);
  });

  it('detects AWS access key', async () => {
    const v = new SecretLeakValidator();
    const fs = memoryFs({ 'src/a.ts': 'const k = "AKIAIOSFODNN7EXAMPLE";' });
    const findings = await v.run(ctx(fs, ['src/a.ts']));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].line).toBe(1);
    expect(findings[0].path).toBe('src/a.ts');
    expect(String(findings[0].metadata?.snippet)).toContain('[REDACTED]');
    expect(String(findings[0].metadata?.snippet)).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('detects GitHub token', async () => {
    const v = new SecretLeakValidator();
    const fs = memoryFs({
      'src/a.ts': 'const t = "ghp_1234567890abcdefghijklmnopqrstuvwxyzAB";',
    });
    const findings = await v.run(ctx(fs, ['src/a.ts']));
    expect(findings.some((f) => f.metadata?.ruleId === 'github-token')).toBe(true);
  });

  it('detects PEM private key block', async () => {
    const v = new SecretLeakValidator();
    const fs = memoryFs({
      'config/keys.ts': 'const x = `\n-----BEGIN RSA PRIVATE KEY-----\nMIIB...\n`;',
    });
    const findings = await v.run(ctx(fs, ['config/keys.ts']));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe('blocker');
  });

  it('ignores placeholder values like ${ENV}', async () => {
    const v = new SecretLeakValidator();
    const fs = memoryFs({
      'src/a.ts': 'const k = `api_key="${process.env.KEY}"`;',
    });
    const findings = await v.run(ctx(fs, ['src/a.ts']));
    expect(findings).toHaveLength(0);
  });

  it('skips node_modules and dist paths', async () => {
    const v = new SecretLeakValidator();
    const fs = memoryFs({
      'node_modules/lib/x.js': 'AKIAIOSFODNN7EXAMPLE',
      'dist/extension.js': 'AKIAIOSFODNN7EXAMPLE',
    });
    const findings = await v.run(ctx(fs, ['node_modules/lib/x.js', 'dist/extension.js']));
    expect(findings).toEqual([]);
  });

  it('skips *.test.ts files by default', async () => {
    const v = new SecretLeakValidator();
    const fs = memoryFs({ 'src/a.test.ts': 'const k = "AKIAIOSFODNN7EXAMPLE";' });
    const findings = await v.run(ctx(fs, ['src/a.test.ts']));
    expect(findings).toEqual([]);
  });

  it('respects abort signal', async () => {
    const v = new SecretLeakValidator();
    const fs = memoryFs({ 'src/a.ts': 'const k = "AKIAIOSFODNN7EXAMPLE";' });
    const ac = new AbortController();
    ac.abort();
    const findings = await v.run({ ...ctx(fs, ['src/a.ts']), signal: ac.signal });
    expect(findings).toEqual([]);
  });

  it('does not include test files when read fails (graceful)', async () => {
    const v = new SecretLeakValidator();
    const fs: IFileSystem = {
      ensureDir: async () => {},
      writeFile: async () => {},
      readFile: async () => {
        throw new Error('io');
      },
      fileExists: async () => false,
      listDir: async () => [],
      deleteFile: async () => {},
      deleteDir: async () => {},
    };
    const findings = await v.run(ctx(fs, ['src/a.ts']));
    expect(findings).toEqual([]);
  });

  it('exposes default rule set', () => {
    expect(DEFAULT_SECRET_RULES.length).toBeGreaterThan(3);
  });
});
