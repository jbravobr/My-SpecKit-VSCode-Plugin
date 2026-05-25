import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readEvidence,
  validateRefactorEvidence,
  writeEvidence,
  type GraphInspectionEvidence,
} from '../../../src/graph/GraphInspectionEvidence';

const workspaceRoot = path.join(process.cwd(), '.speckit-test-artifacts', 'graph-inspection');

async function cleanWorkspace(): Promise<void> {
  await rm(workspaceRoot, { recursive: true, force: true });
}

async function writeHead(sha: string): Promise<void> {
  const refDir = path.join(workspaceRoot, '.git', 'refs', 'heads');
  await mkdir(refDir, { recursive: true });
  await writeFile(path.join(workspaceRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
  await writeFile(path.join(refDir, 'main'), `${sha}\n`, 'utf8');
}

describe('GraphInspectionEvidence', () => {
  afterEach(async () => {
    await cleanWorkspace();
  });

  it('writes and reads evidence with normalized node paths', async () => {
    const evidence: GraphInspectionEvidence = {
      timestamp: '2026-01-01T00:00:00.000Z',
      storyId: 'STORY-001',
      consultedEntities: [{ nodeId: 'src\\feature\\Service.ts', reason: 'entry point' }],
      headSha: 'abc123',
    };

    await writeEvidence(workspaceRoot, evidence);
    const loaded = await readEvidence(workspaceRoot);

    expect(loaded).toEqual({
      ...evidence,
      consultedEntities: [{ nodeId: 'src/feature/Service.ts', reason: 'entry point' }],
    });
  });

  it('validates missing evidence as blocking', async () => {
    await expect(validateRefactorEvidence(workspaceRoot)).resolves.toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('accepts VETO_GRAPH_NOT_AVAILABLE evidence', async () => {
    await writeEvidence(workspaceRoot, {
      timestamp: '2026-01-01T00:00:00.000Z',
      consultedEntities: [],
      veto: 'VETO_GRAPH_NOT_AVAILABLE',
    });

    await expect(validateRefactorEvidence(workspaceRoot)).resolves.toEqual({
      ok: true,
      reason: 'vetoed',
    });
  });

  it('rejects empty consulted entities without veto', async () => {
    await writeEvidence(workspaceRoot, {
      timestamp: '2026-01-01T00:00:00.000Z',
      consultedEntities: [],
    });

    await expect(validateRefactorEvidence(workspaceRoot)).resolves.toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('accepts at least one consulted entity', async () => {
    await writeEvidence(workspaceRoot, {
      timestamp: '2026-01-01T00:00:00.000Z',
      consultedEntities: [{ nodeId: 'src/app.ts', reason: 'changed file dependency' }],
    });

    await expect(validateRefactorEvidence(workspaceRoot)).resolves.toEqual({ ok: true });
  });

  it('rejects stale evidence when headSha differs from current HEAD', async () => {
    await writeEvidence(workspaceRoot, {
      timestamp: '2026-01-01T00:00:00.000Z',
      consultedEntities: [{ nodeId: 'src/app.ts', reason: 'changed file dependency' }],
      headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    await writeHead('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

    await expect(validateRefactorEvidence(workspaceRoot, { compareHead: true })).resolves.toEqual({
      ok: false,
      reason: 'stale',
    });
  });
});
