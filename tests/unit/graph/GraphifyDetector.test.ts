import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphifyDetector } from '../../../src/graph/GraphifyDetector';

const workspaceRootBase = path.join(process.cwd(), '.speckit-test-artifacts', 'graphify-detector');
let workspaceRoot: string;

async function createFile(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, '# graphify\n', 'utf8');
}

beforeEach(async () => {
  workspaceRoot = path.join(workspaceRootBase, randomUUID());
  await rm(workspaceRoot, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
});

describe('GraphifyDetector', () => {
  it('returns no sources when graphify artifacts are absent', async () => {
    const detector = new GraphifyDetector();

    const result = await detector.detect(workspaceRoot);

    expect(result).toEqual({ found: false, sources: [] });
  });

  it('detects supported graphify sources in deterministic order', async () => {
    const detector = new GraphifyDetector();
    const graphifyOut = path.join(workspaceRoot, 'graphify-out');
    const claudeSkill = path.join(workspaceRoot, '.claude', 'skills', 'graphify', 'SKILL.md');
    const agentsSkill = path.join(workspaceRoot, '.agents', 'skills', 'graphify', 'SKILL.md');
    const copilotSkill = path.join(workspaceRoot, '.copilot', 'skills', 'graphify', 'SKILL.md');
    await mkdir(graphifyOut, { recursive: true });
    await createFile(copilotSkill);
    await createFile(claudeSkill);
    await createFile(agentsSkill);

    const result = await detector.detect(workspaceRoot);

    expect(result).toEqual({
      found: true,
      sources: [graphifyOut, claudeSkill, agentsSkill, copilotSkill],
    });
  });

  it('ignores paths with the wrong filesystem kind', async () => {
    const detector = new GraphifyDetector();
    const graphifyOutFile = path.join(workspaceRoot, 'graphify-out');
    const claudeSkillDirectory = path.join(
      workspaceRoot,
      '.claude',
      'skills',
      'graphify',
      'SKILL.md',
    );
    await createFile(graphifyOutFile);
    await mkdir(claudeSkillDirectory, { recursive: true });

    const result = await detector.detect(workspaceRoot);

    expect(result).toEqual({ found: false, sources: [] });
  });
});
