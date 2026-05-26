import { describe, expect, it } from 'vitest';
import type { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import { runPreGateDryCheck, type PreGateDryRunDeps } from '../../../src/validator/auto/PreGateDryRunner';
import { ValidationRegistry } from '../../../src/validator/auto/ValidationRegistry';
import type { Finding, Validator } from '../../../src/validator/auto/types';

interface MemFS extends IFileSystem {
  files: Map<string, string>;
  dirs: Set<string>;
}

interface TestDeps extends PreGateDryRunDeps {
  registry?: ValidationRegistry;
  changedFiles?: string[];
  now?: () => Date;
}

const STORY_SPEC = `<!-- metadata
id: 1
title: Dry run
createdAt: 2024-01-01
type: story
status: in-progress
gate: 2
version: 1
-->

# Dry run

## Critérios de Aceite

- Validar pre-gate dry-run
`;

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function createMemFs(initial: Record<string, string> = {}): MemFS {
  const files = new Map<string, string>(
    Object.entries(initial).map(([filePath, content]) => [normalizePath(filePath), content]),
  );
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    ensureDir: async (dirPath) => {
      dirs.add(normalizePath(dirPath));
    },
    writeFile: async (filePath, content) => {
      files.set(normalizePath(filePath), content);
    },
    readFile: async (filePath) => {
      const normalizedPath = normalizePath(filePath);
      if (!files.has(normalizedPath)) {
        throw new Error(`ENOENT: ${filePath}`);
      }
      return files.get(normalizedPath)!;
    },
    fileExists: async (filePath) => files.has(normalizePath(filePath)),
    listDir: async () => [],
    deleteFile: async () => {},
    deleteDir: async () => {},
  };
}

function makeValidator(
  id: string,
  findings: Finding[] = [],
  options: { throws?: string } = {},
): Validator {
  return {
    id,
    description: `validator ${id}`,
    async run() {
      if (options.throws) {
        throw new Error(options.throws);
      }
      return findings;
    },
  };
}

function createRegistry(validators: Validator[]): ValidationRegistry {
  const registry = new ValidationRegistry();
  validators.forEach((validator) => registry.register(validator));
  return registry;
}

describe('runPreGateDryCheck', () => {
  it('returns passed=true when all validators pass', async () => {
    const fs = createMemFs({ '/ws/.speckit/STORY-001.md': STORY_SPEC });
    const deps: TestDeps = {
      workspaceRoot: '/ws',
      specPath: '/ws/.speckit/STORY-001.md',
      fs,
      registry: createRegistry([
        makeValidator('story-heuristic'),
        makeValidator('typecheck'),
        makeValidator('coverage-threshold'),
      ]),
      changedFiles: ['src/app.ts'],
      now: () => new Date('2024-06-01T00:00:00Z'),
    };

    const result = await runPreGateDryCheck(deps);

    expect(result.passed).toBe(true);
    expect(result.blockerCount).toBe(0);
    expect(result.findings).toEqual([]);
    expect(result.evidencePath?.replace(/\\/g, '/')).toBe('/ws/.speckit/evidence/pre-gate-dry-run.md');
  });

  it('returns passed=false and blockerCount=1 when a blocker finding exists', async () => {
    const fs = createMemFs({ '/ws/.speckit/STORY-001.md': STORY_SPEC });
    const deps: TestDeps = {
      workspaceRoot: '/ws',
      specPath: '/ws/.speckit/STORY-001.md',
      fs,
      registry: createRegistry([
        makeValidator('secret-leak', [
          {
            validator: 'secret-leak',
            severity: 'blocker',
            message: 'Segredo hardcoded detectado.',
            path: 'src/app.ts',
            line: 7,
          },
        ]),
      ]),
      changedFiles: ['src/app.ts'],
    };

    const result = await runPreGateDryCheck(deps);

    expect(result.passed).toBe(false);
    expect(result.blockerCount).toBe(1);
    expect(result.findings).toHaveLength(1);
  });

  it('catches validator throws and reports them as findings', async () => {
    const fs = createMemFs({ '/ws/.speckit/STORY-001.md': STORY_SPEC });
    const deps: TestDeps = {
      workspaceRoot: '/ws',
      specPath: '/ws/.speckit/STORY-001.md',
      fs,
      registry: createRegistry([makeValidator('boom', [], { throws: 'kaboom' })]),
      changedFiles: ['src/app.ts'],
    };

    const result = await runPreGateDryCheck(deps);

    expect(result.passed).toBe(false);
    expect(result.blockerCount).toBe(0);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].validator).toBe('boom');
    expect(result.findings[0].severity).toBe('error');
    expect(result.findings[0].message).toMatch(/kaboom/);
  });

  it('writes the evidence file', async () => {
    const fs = createMemFs({ '/ws/.speckit/STORY-001.md': STORY_SPEC });
    const deps: TestDeps = {
      workspaceRoot: '/ws',
      specPath: '/ws/.speckit/STORY-001.md',
      fs,
      registry: createRegistry([makeValidator('story-heuristic')]),
      changedFiles: ['src/app.ts'],
      now: () => new Date('2024-06-01T00:00:00Z'),
    };

    const result = await runPreGateDryCheck(deps);
    const evidence = fs.files.get('/ws/.speckit/evidence/pre-gate-dry-run.md');

    expect(result.evidencePath?.replace(/\\/g, '/')).toBe('/ws/.speckit/evidence/pre-gate-dry-run.md');
    expect(fs.dirs.has('/ws/.speckit/evidence')).toBe(true);
    expect(evidence).toContain('# Pre-Gate Dry Run');
    expect(evidence).toContain('2024-06-01T00:00:00.000Z');
  });
});
