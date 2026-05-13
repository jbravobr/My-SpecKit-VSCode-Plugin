import { describe, it, expect, beforeEach } from 'vitest';
import { runSpecHeuristicOnSave } from '../../../src/workflow/SpecAutoValidationRunner';
import type { IFileSystem } from '../../../src/generator/utils/IFileSystem';

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

const STORY_WITH_POST = `<!-- metadata
id: 99
title: Receber eventos
createdAt: 2024-01-01
type: story
status: draft
gate: 0
version: 1
-->

# Story 99

## Critérios de Aceite

- Consumir eventos do tópico Kafka transacoes
`;

const STORY_OK = `<!-- metadata
id: 7
title: Tela de login
createdAt: 2024-01-01
type: story
status: draft
gate: 0
version: 1
-->

# Login

## Critérios de Aceite

- Renderizar tela de login
`;

const FIX_SPEC = `<!-- metadata
id: 5
title: ajuste
createdAt: 2024-01-01
type: fix
status: draft
gate: 0
version: 1
-->

# Fix
`;

describe('runSpecHeuristicOnSave', () => {
  let fs: MemFS;
  beforeEach(() => {
    fs = memFs();
  });

  it('skips non-story specs without writing evidence', async () => {
    fs.files.set('/ws/.speckit/specs/active.md', FIX_SPEC);
    const r = await runSpecHeuristicOnSave({
      fs,
      workspaceRoot: '/ws',
      specPath: '/ws/.speckit/specs/active.md',
    });
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/not-a-story/);
    expect(fs.files.has('/ws/.speckit/evidence/latest-heuristic.md')).toBe(false);
  });

  it('writes an empty-findings report when heuristics pass', async () => {
    fs.files.set('/ws/.speckit/specs/active.md', STORY_OK);
    const r = await runSpecHeuristicOnSave({
      fs,
      workspaceRoot: '/ws',
      specPath: '/ws/.speckit/specs/active.md',
      now: () => new Date('2024-06-01T00:00:00Z'),
    });
    expect(r.ran).toBe(true);
    expect(r.findings).toEqual([]);
    expect(fs.dirs.has('/ws/.speckit/evidence')).toBe(true);
    const md = fs.files.get('/ws/.speckit/evidence/latest-heuristic.md')!;
    expect(md).toContain('Nenhuma disciplina');
    expect(md).toContain('STORY-7');
  });

  it('writes findings when heuristic triggers (e.g. event consumer without idempotency)', async () => {
    fs.files.set('/ws/.speckit/specs/active.md', STORY_WITH_POST);
    const r = await runSpecHeuristicOnSave({
      fs,
      workspaceRoot: '/ws',
      specPath: '/ws/.speckit/specs/active.md',
    });
    expect(r.ran).toBe(true);
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.findings.some((f) => f.metadata?.['ruleId'] === 'idempotency')).toBe(true);
    const md = fs.files.get('/ws/.speckit/evidence/latest-heuristic.md')!;
    expect(md).toMatch(/idempotency/);
    expect(md).toMatch(/STORY-99/);
  });

  it('returns ran:false reason when file read fails (never throws)', async () => {
    const r = await runSpecHeuristicOnSave({
      fs,
      workspaceRoot: '/ws',
      specPath: '/ws/missing.md',
    });
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/read-error/);
  });

  it('uses backslash separator when workspaceRoot is windows-style', async () => {
    const winPath = 'C:\\ws\\.speckit\\specs\\active.md';
    fs.files.set(winPath, STORY_WITH_POST);
    const r = await runSpecHeuristicOnSave({
      fs,
      workspaceRoot: 'C:\\ws',
      specPath: winPath,
    });
    expect(r.ran).toBe(true);
    expect(r.reportPath).toBe('C:\\ws\\.speckit\\evidence\\latest-heuristic.md');
  });
});
