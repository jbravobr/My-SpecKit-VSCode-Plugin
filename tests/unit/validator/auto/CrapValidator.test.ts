import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  CrapValidator,
  computeCrap,
  extractFunctionsWithCC,
} from '../../../../src/validator/auto/CrapValidator';
import type { IFileSystem } from '../../../../src/generator/utils/IFileSystem';
import type { ValidatorContext } from '../../../../src/validator/auto/types';

function fs(files: Record<string, string>): IFileSystem {
  return {
    ensureDir: async () => {},
    writeFile: async () => {},
    readFile: async (p: string) => {
      const norm = p.replace(/\\/g, '/');
      const direct = files[norm];
      if (direct !== undefined) return direct;
      for (const k of Object.keys(files)) {
        if (norm.endsWith(k)) return files[k];
      }
      throw new Error(`ENOENT: ${p}`);
    },
    fileExists: async (p: string) => {
      const norm = p.replace(/\\/g, '/');
      return Object.keys(files).some((k) => norm.endsWith(k));
    },
    listDir: async () => [],
    deleteFile: async () => {},
    deleteDir: async () => {},
  };
}

function ctx(opts: {
  fs: IFileSystem;
  storyFiles?: string[];
  gateTarget?: 0 | 1 | 2 | 3 | 4;
}): ValidatorContext {
  return {
    workspaceRoot: '/ws',
    fs: opts.fs,
    storyFiles: opts.storyFiles ?? [],
    gateTarget: opts.gateTarget,
  };
}

describe('computeCrap', () => {
  it('returns CC for fully covered function', () => {
    expect(computeCrap(5, 100)).toBeCloseTo(5);
    expect(computeCrap(10, 100)).toBeCloseTo(10);
  });

  it('returns CC^2 + CC when coverage is 0', () => {
    expect(computeCrap(5, 0)).toBeCloseTo(30);
    expect(computeCrap(10, 0)).toBeCloseTo(110);
  });

  it('is monotonically decreasing in coverage', () => {
    const a = computeCrap(8, 50);
    const b = computeCrap(8, 80);
    expect(a).toBeGreaterThan(b);
  });

  it('clamps coverage to [0, 100]', () => {
    expect(computeCrap(5, -10)).toBeCloseTo(computeCrap(5, 0));
    expect(computeCrap(5, 150)).toBeCloseTo(computeCrap(5, 100));
  });
});

describe('extractFunctionsWithCC', () => {
  it('counts CC=1 for trivial function', () => {
    const fns = extractFunctionsWithCC('function f() { return 1; }');
    expect(fns).toHaveLength(1);
    expect(fns[0].cc).toBe(1);
    expect(fns[0].name).toBe('f');
  });

  it('counts decision nodes: if/for/while/ternary/&&/||/case/catch', () => {
    const src = `
      function f(a, b, c) {
        if (a && b || c) { for (let i = 0; i < 10; i++) {} }
        while (a) { do {} while (b); }
        try { } catch (e) {}
        switch (a) { case 1: break; case 2: break; default: break; }
        return a ? b : c;
      }
    `;
    const fns = extractFunctionsWithCC(src);
    expect(fns).toHaveLength(1);
    // 1 (base) + 1 (if) + 1 (&&) + 1 (||) + 1 (for) + 1 (while) + 1 (do) + 1 (catch) + 2 (cases) + 1 (ternary) = 11
    expect(fns[0].cc).toBe(11);
  });

  it('records arrow functions assigned to const', () => {
    const fns = extractFunctionsWithCC('const g = (x) => x > 0 ? 1 : -1;');
    expect(fns).toHaveLength(1);
    expect(fns[0].name).toBe('g');
    expect(fns[0].cc).toBe(2);
  });

  it('records methods inside classes', () => {
    const fns = extractFunctionsWithCC(`class K { foo(a) { if (a) return 1; return 0; } }`);
    const foo = fns.find((f) => f.name === 'foo');
    expect(foo).toBeDefined();
    expect(foo?.cc).toBe(2);
  });

  it('separates nested function CCs', () => {
    const src = `function outer() {
      if (true) {}
      function inner() { while (true) {} }
    }`;
    const fns = extractFunctionsWithCC(src);
    const outer = fns.find((f) => f.name === 'outer');
    const inner = fns.find((f) => f.name === 'inner');
    expect(outer?.cc).toBe(2);
    expect(inner?.cc).toBe(2);
  });
});

describe('CrapValidator', () => {
  const summaryPath =
    '/' + path.join('ws', 'coverage', 'coverage-summary.json').replace(/\\/g, '/');

  function summary(filePct: Record<string, number>): object {
    const out: Record<string, unknown> = {};
    for (const [k, pct] of Object.entries(filePct)) {
      out[k] = {
        lines: { total: 100, covered: pct, skipped: 0, pct },
        statements: { total: 100, covered: pct, skipped: 0, pct },
        functions: { total: 10, covered: 10, skipped: 0, pct },
        branches: { total: 50, covered: 50, skipped: 0, pct },
      };
    }
    return out;
  }

  it('returns empty when no story files', async () => {
    const v = new CrapValidator();
    expect(await v.run(ctx({ fs: fs({}) }))).toEqual([]);
  });

  it('does not flag low-CC functions', async () => {
    const src = 'export function f() { return 1; }';
    const files = {
      [summaryPath]: JSON.stringify(summary({ '/ws/src/a.ts': 0 })),
      '/ws/src/a.ts': src,
    };
    const v = new CrapValidator();
    const findings = await v.run(ctx({ fs: fs(files), storyFiles: ['src/a.ts'] }));
    expect(findings).toEqual([]);
  });

  it('flags high-CC function with low coverage', async () => {
    // build a function with CC=8 (many decisions)
    const src = `
      export function heavy(a, b, c, d, e) {
        if (a) {} if (b) {} if (c) {} if (d) {} if (e) {}
        if (a && b) {}
        if (a || b) {}
        return a;
      }
    `;
    const files = {
      [summaryPath]: JSON.stringify(summary({ '/ws/src/h.ts': 30 })),
      '/ws/src/h.ts': src,
    };
    const v = new CrapValidator();
    const findings = await v.run(ctx({ fs: fs(files), storyFiles: ['src/h.ts'], gateTarget: 2 }));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const f = findings.find((x) => x.metadata?.function === 'heavy');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('error');
    expect((f?.metadata?.crap as number) > 30).toBe(true);
  });

  it('does not flag high-CC function with high coverage (CRAP under threshold)', async () => {
    const src = `
      export function heavy(a, b, c, d, e) {
        if (a) {} if (b) {} if (c) {} if (d) {} if (e) {}
        if (a && b) {}
        return a;
      }
    `;
    const files = {
      [summaryPath]: JSON.stringify(summary({ '/ws/src/h.ts': 95 })),
      '/ws/src/h.ts': src,
    };
    const v = new CrapValidator();
    const findings = await v.run(ctx({ fs: fs(files), storyFiles: ['src/h.ts'] }));
    expect(findings.filter((f) => f.metadata?.function === 'heavy')).toEqual([]);
  });

  it('emits warn delegated to Revisor when coverage summary is missing', async () => {
    const src = `
      export function heavy(a, b, c, d, e) {
        if (a) {} if (b) {} if (c) {} if (d) {} if (e) {} if (a && b) {}
        return a;
      }
    `;
    const v = new CrapValidator();
    const findings = await v.run(
      ctx({ fs: fs({ '/ws/src/h.ts': src }), storyFiles: ['src/h.ts'] }),
    );
    const delegated = findings.find((f) => f.delegatedToRevisor?.command?.includes('coverage'));
    expect(delegated).toBeDefined();
  });

  it('delegates non-TS stacks (java/python/csharp/go) to Revisor', async () => {
    const v = new CrapValidator();
    const findings = await v.run(
      ctx({
        fs: fs({}),
        storyFiles: ['src/Foo.java', 'src/bar.py', 'src/Baz.cs', 'src/qux.go'],
      }),
    );
    const stacks = findings.map((f) => f.metadata?.stack).sort();
    expect(stacks).toEqual(['csharp', 'go', 'java', 'python']);
    for (const f of findings) {
      expect(f.delegatedToRevisor?.command).toBeTruthy();
    }
  });
});
