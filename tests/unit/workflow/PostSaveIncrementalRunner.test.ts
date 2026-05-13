import { describe, it, expect, beforeEach } from 'vitest';
import { runIncrementalCrapForSavedFile } from '../../../src/workflow/PostSaveIncrementalRunner';
import type { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import type { IWorkspace } from '../../../src/generator/utils/IWorkspace';
import type { Validator } from '../../../src/validator/auto/types';

interface MemFS extends IFileSystem {
  files: Map<string, string>;
  dirs: Set<string>;
}

function memFs(initial: Record<string, string> = {}): MemFS {
  const files = new Map<string, string>(Object.entries(initial));
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    ensureDir: async (p) => {
      dirs.add(p);
    },
    writeFile: async (p, c) => {
      files.set(p, c);
    },
    readFile: async (p) => {
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      return files.get(p)!;
    },
    fileExists: async (p) => files.has(p),
    listDir: async () => [],
    deleteFile: async () => {},
    deleteDir: async () => {},
  };
}

function workspace(root: string | undefined, specPath?: string): IWorkspace {
  return {
    getWorkspaceRoot: () => root,
    listStoryFiles: async () => [],
    listFixFiles: async () => [],
    getActiveStoryPath: async () => specPath,
    getActiveSpecPath: async () => specPath,
    detectTechStack: async () => ({}) as never,
    detectAllTechStacks: async () => [],
  };
}

function story(gate: number): string {
  return `<!-- metadata
id: 42
title: Story
createdAt: 2024-01-01
type: story
status: draft
gate: ${gate}
version: 1
-->

# Story
`;
}

const stubCrap: Validator = {
  id: 'crap-score',
  description: 'stub',
  async run() {
    return [
      {
        validator: 'crap-score',
        severity: 'error',
        message: 'CRAP 45 em handler()',
        path: 'src/a.ts',
        line: 10,
        suggestedFix: 'extrair função',
      },
    ];
  },
};

describe('runIncrementalCrapForSavedFile', () => {
  let fs: MemFS;
  beforeEach(() => {
    fs = memFs();
  });

  it('skips non-TS/JS files', async () => {
    const r = await runIncrementalCrapForSavedFile({
      fs,
      workspace: workspace('/ws', '/ws/spec.md'),
      savedFilePath: '/ws/README.md',
    });
    expect(r.ran).toBe(false);
    expect(r.reason).toBe('not-ts-or-js');
  });

  it('skips when no workspace', async () => {
    const r = await runIncrementalCrapForSavedFile({
      fs,
      workspace: workspace(undefined),
      savedFilePath: '/ws/a.ts',
    });
    expect(r.reason).toBe('no-workspace');
  });

  it('skips when no active spec', async () => {
    const r = await runIncrementalCrapForSavedFile({
      fs,
      workspace: workspace('/ws', undefined),
      savedFilePath: '/ws/a.ts',
    });
    expect(r.reason).toBe('no-active-spec');
  });

  it('skips when active spec is not a story', async () => {
    fs.files.set(
      '/ws/spec.md',
      `<!-- metadata
id: 1
type: fix
gate: 2
-->
`,
    );
    const r = await runIncrementalCrapForSavedFile({
      fs,
      workspace: workspace('/ws', '/ws/spec.md'),
      savedFilePath: '/ws/a.ts',
    });
    expect(r.reason).toMatch(/not-a-story/);
  });

  it('skips when story gate is below threshold (default 2)', async () => {
    fs.files.set('/ws/spec.md', story(1));
    const r = await runIncrementalCrapForSavedFile({
      fs,
      workspace: workspace('/ws', '/ws/spec.md'),
      savedFilePath: '/ws/a.ts',
    });
    expect(r.reason).toMatch(/gate-below-min:1/);
  });

  it('runs validator and writes report when conditions are met', async () => {
    fs.files.set('/ws/spec.md', story(3));
    const r = await runIncrementalCrapForSavedFile({
      fs,
      workspace: workspace('/ws', '/ws/spec.md'),
      savedFilePath: '/ws/src/a.ts',
      crapValidator: stubCrap,
      now: () => new Date('2024-06-01T00:00:00Z'),
    });
    expect(r.ran).toBe(true);
    expect(r.findings.length).toBe(1);
    expect(fs.dirs.has('/ws/.speckit/evidence')).toBe(true);
    const md = fs.files.get('/ws/.speckit/evidence/latest-crap.md')!;
    expect(md).toContain('STORY-42');
    expect(md).toContain('CRAP 45');
    expect(md).toContain('src/a.ts');
  });

  it('writes empty-findings report when validator returns no findings', async () => {
    fs.files.set('/ws/spec.md', story(2));
    const r = await runIncrementalCrapForSavedFile({
      fs,
      workspace: workspace('/ws', '/ws/spec.md'),
      savedFilePath: '/ws/src/b.ts',
      crapValidator: { id: 'crap-score', description: '', run: async () => [] },
    });
    expect(r.ran).toBe(true);
    expect(r.findings).toEqual([]);
    const md = fs.files.get('/ws/.speckit/evidence/latest-crap.md')!;
    expect(md).toContain('Nenhuma função');
  });

  it('never throws on validator exception', async () => {
    fs.files.set('/ws/spec.md', story(3));
    const failing: Validator = {
      id: 'crap-score',
      description: '',
      run: async () => {
        throw new Error('boom');
      },
    };
    const r = await runIncrementalCrapForSavedFile({
      fs,
      workspace: workspace('/ws', '/ws/spec.md'),
      savedFilePath: '/ws/src/a.ts',
      crapValidator: failing,
    });
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/validator-error/);
  });
});
