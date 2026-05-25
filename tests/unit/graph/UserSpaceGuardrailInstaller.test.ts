import { promises as fs } from 'fs';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UserSpaceGuardrailInstaller } from '../../../src/graph/UserSpaceGuardrailInstaller';

const testHomesRoot = path.join(process.cwd(), '.speckit', 'test-homes');

async function createTestHome(): Promise<string> {
  await fs.mkdir(testHomesRoot, { recursive: true });
  return fs.mkdtemp(path.join(testHomesRoot, 'user-space-installer-'));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('UserSpaceGuardrailInstaller', () => {
  let homeDir: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(async () => {
    homeDir = await createTestHome();
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }

    await fs.rm(homeDir, { recursive: true, force: true });
  });

  it('dryRun reports creates only under existing parent directories', async () => {
    await fs.mkdir(path.join(homeDir, '.copilot', 'skills'), { recursive: true });

    const result = await new UserSpaceGuardrailInstaller().dryRun();

    const createTargets = result.targets.filter((target) => target.action === 'create');
    const skippedTargets = result.targets.filter(
      (target) => target.reason === 'parent directory not found',
    );
    expect(createTargets.map((target) => path.basename(target.path)).sort()).toEqual([
      'REFERENCE-graph.md',
      'SKILL.md',
    ]);
    expect(skippedTargets).toHaveLength(4);
    expect(result.targets.every((target) => path.isAbsolute(target.path))).toBe(true);
  });

  it('throws when install is not explicitly confirmed', async () => {
    await expect(new UserSpaceGuardrailInstaller().install({ confirm: false })).rejects.toThrow(
      'install requires confirm:true',
    );
  });

  it('installs files and is idempotent on the second run', async () => {
    await fs.mkdir(path.join(homeDir, '.copilot', 'skills'), { recursive: true });
    await fs.mkdir(path.join(homeDir, '.cursor', 'rules'), { recursive: true });
    const installer = new UserSpaceGuardrailInstaller();

    const firstInstall = await installer.install({ confirm: true });

    expect(firstInstall.written).toHaveLength(4);
    const copilotSkillPath = path.join(homeDir, '.copilot', 'skills', 'speckit-graph', 'SKILL.md');
    const copilotReferencePath = path.join(
      homeDir,
      '.copilot',
      'skills',
      'speckit-graph',
      'REFERENCE-graph.md',
    );
    const cursorSkillPath = path.join(homeDir, '.cursor', 'rules', 'speckit-graph.md');
    const cursorReferencePath = path.join(homeDir, '.cursor', 'rules', 'REFERENCE-graph.md');
    const claudeSkillPath = path.join(homeDir, '.claude', 'skills', 'speckit-graph', 'SKILL.md');

    await expect(fs.readFile(copilotSkillPath, 'utf8')).resolves.toContain(
      '# Navegação Estrutural por Grafo',
    );
    await expect(fs.readFile(copilotSkillPath, 'utf8')).resolves.not.toMatch(/^---/);
    await expect(fs.readFile(copilotReferencePath, 'utf8')).resolves.toContain(
      'REFERÊNCIA do speckit-baseline',
    );
    await expect(exists(cursorSkillPath)).resolves.toBe(true);
    await expect(exists(cursorReferencePath)).resolves.toBe(true);
    await expect(exists(claudeSkillPath)).resolves.toBe(false);

    const secondInstall = await installer.install({ confirm: true });
    const secondDryRun = await installer.dryRun();

    expect(secondInstall.written).toEqual([]);
    expect(
      secondDryRun.targets.filter((target) => target.reason === 'identical content'),
    ).toHaveLength(4);
  });

  it('detects hash-diff updates without writing during dryRun', async () => {
    await fs.mkdir(path.join(homeDir, '.copilot', 'skills', 'speckit-graph'), { recursive: true });
    const skillPath = path.join(homeDir, '.copilot', 'skills', 'speckit-graph', 'SKILL.md');
    await fs.writeFile(skillPath, 'outdated', 'utf8');

    const result = await new UserSpaceGuardrailInstaller().dryRun();

    expect(result.targets).toContainEqual({
      path: skillPath,
      action: 'update',
      reason: 'hash diff',
    });
    await expect(fs.readFile(skillPath, 'utf8')).resolves.toBe('outdated');
  });
});
