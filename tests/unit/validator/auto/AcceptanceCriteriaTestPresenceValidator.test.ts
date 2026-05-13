import { describe, it, expect } from 'vitest';
import {
  AcceptanceCriteriaTestPresenceValidator,
  extractSignificantTokens,
} from '../../../../src/validator/auto/AcceptanceCriteriaTestPresenceValidator';
import { emptyStory } from '../../../../src/story/Story';
import type { Story } from '../../../../src/story/Story';
import type { IFileSystem } from '../../../../src/generator/utils/IFileSystem';
import type { ValidatorContext } from '../../../../src/validator/auto/types';

function makeFs(files: Record<string, string>): IFileSystem {
  return {
    ensureDir: async () => {},
    writeFile: async () => {},
    readFile: async (p: string) => {
      const norm = p.replace(/\\/g, '/');
      const direct = files[norm];
      if (direct !== undefined) return direct;
      for (const key of Object.keys(files)) {
        if (norm.endsWith(key)) return files[key];
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

function storyWith(criteria: string[]): Story {
  const s = emptyStory();
  s.functionalSpec.acceptanceCriteria = criteria;
  return s;
}

function ctx(opts: {
  story?: Story;
  storyFiles?: string[];
  fs?: IFileSystem;
  gateTarget?: 0 | 1 | 2 | 3 | 4;
}): ValidatorContext {
  return {
    workspaceRoot: '/ws',
    fs: opts.fs ?? makeFs({}),
    story: opts.story,
    storyFiles: opts.storyFiles ?? [],
    gateTarget: opts.gateTarget,
  };
}

describe('extractSignificantTokens', () => {
  it('drops words of length <= 4 and stopwords', () => {
    const tokens = extractSignificantTokens('O usuario deve poder criar pedido');
    expect(tokens).toContain('usuario');
    expect(tokens).toContain('criar');
    expect(tokens).toContain('pedido');
    expect(tokens).not.toContain('deve');
    expect(tokens).not.toContain('o');
  });

  it('is case-insensitive and deduplicates', () => {
    const tokens = extractSignificantTokens('Pedido pedido PEDIDO');
    expect(tokens).toEqual(['pedido']);
  });
});

describe('AcceptanceCriteriaTestPresenceValidator', () => {
  const v = new AcceptanceCriteriaTestPresenceValidator();

  it('returns no findings when story is missing', async () => {
    expect(await v.run(ctx({}))).toEqual([]);
  });

  it('returns no findings when story has no criteria', async () => {
    expect(await v.run(ctx({ story: storyWith([]) }))).toEqual([]);
  });

  it('emits warn for each criterion when no test files were modified', async () => {
    const story = storyWith(['Calcular comissao do vendedor', 'Persistir resultado']);
    const findings = await v.run(ctx({ story, storyFiles: ['src/calc.ts'] }));
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === 'warn')).toBe(true);
  });

  it('escala para error quando gateTarget=2 e nenhum teste rastreavel', async () => {
    const story = storyWith(['Calcular comissao']);
    const findings = await v.run(ctx({ story, storyFiles: ['src/calc.ts'], gateTarget: 2 }));
    expect(findings.every((f) => f.severity === 'error')).toBe(true);
  });

  it('passa quando o teste contem tokens significativos do criterio', async () => {
    const story = storyWith(['Calcular comissao do vendedor']);
    const fs = makeFs({
      '/ws/tests/calc.test.ts':
        "describe('comissao', () => { it('calcula comissao do vendedor', () => {}); });",
    });
    const findings = await v.run(ctx({ story, storyFiles: ['tests/calc.test.ts'], fs }));
    expect(findings).toEqual([]);
  });

  it('flagueia criterios nao referenciados em nenhum teste', async () => {
    const story = storyWith([
      'Calcular comissao do vendedor',
      'Notificar usuario por email apos calculo',
    ]);
    const fs = makeFs({
      '/ws/tests/calc.test.ts': "it('calcula comissao do vendedor', () => {});",
    });
    const findings = await v.run(ctx({ story, storyFiles: ['tests/calc.test.ts'], fs }));
    expect(findings).toHaveLength(1);
    expect(findings[0].metadata?.criterionIndex).toBe(1);
  });

  it('ignora arquivos nao-teste em storyFiles', async () => {
    const story = storyWith(['Calcular comissao']);
    const fs = makeFs({
      '/ws/src/calc.ts': 'export function calcular(comissao) {}',
    });
    const findings = await v.run(ctx({ story, storyFiles: ['src/calc.ts'], fs }));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warn');
  });

  it('ignora arquivos ilegiveis sem crashar', async () => {
    const story = storyWith(['Calcular comissao']);
    const fs: IFileSystem = {
      ensureDir: async () => {},
      writeFile: async () => {},
      readFile: async () => {
        throw new Error('boom');
      },
      fileExists: async () => true,
      listDir: async () => [],
      deleteFile: async () => {},
      deleteDir: async () => {},
    };
    const findings = await v.run(ctx({ story, storyFiles: ['tests/x.test.ts'], fs }));
    expect(findings.length).toBeGreaterThan(0);
  });

  it('reconhece padroes de teste java/python/csharp/go', async () => {
    const patterns = [
      'tests/FooTest.java',
      'tests/test_foo.py',
      'tests/FooTests.cs',
      'tests/foo_test.go',
    ];
    const story = storyWith(['Calcular comissao']);
    const fs = makeFs(
      Object.fromEntries(patterns.map((p) => [`/ws/${p}`, 'calcular comissao do vendedor'])),
    );
    const findings = await v.run(ctx({ story, storyFiles: patterns, fs }));
    expect(findings).toEqual([]);
  });
});
