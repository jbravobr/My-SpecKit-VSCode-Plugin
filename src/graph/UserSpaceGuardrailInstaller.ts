import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  generateGraphNavigation,
  generateGraphReference,
} from '../generator/baseline/GraphNavigationGenerator';
import { stripFrontmatter } from '../generator/skill/stripFrontmatter';

export type InstallAction = 'create' | 'update' | 'skip';

export interface InstallTarget {
  path: string;
  action: InstallAction;
  reason?: string;
}

export interface UserSpaceGuardrailDryRunResult {
  targets: InstallTarget[];
}

interface InstallFile {
  path: string;
  parentDir: string;
  targetDir: string;
  content: string;
}

interface InstallLocation {
  parentDir: string;
  targetDir: string;
  skillFileName: string;
}

/**
 * Installs optional user-space graph guardrails for Copilot, Claude, and Cursor surfaces.
 * Cursor is intentionally limited to ~/.cursor/rules/ on every OS; APPDATA is not probed.
 */
export class UserSpaceGuardrailInstaller {
  constructor(private readonly homeDir: string = os.homedir()) {}

  async dryRun(): Promise<UserSpaceGuardrailDryRunResult> {
    const targets: InstallTarget[] = [];
    for (const file of this.buildInstallFiles()) {
      targets.push(await this.inspectTarget(file));
    }
    return { targets };
  }

  async install(opts: { confirm: boolean }): Promise<{ written: InstallTarget[] }> {
    if (opts.confirm !== true) {
      throw new Error('install requires confirm:true');
    }

    const filesByPath = new Map(this.buildInstallFiles().map((file) => [file.path, file]));
    const dryRun = await this.dryRun();
    const writableTargets = dryRun.targets.filter(
      (target) => target.action === 'create' || target.action === 'update',
    );

    for (const target of writableTargets) {
      const file = filesByPath.get(target.path);
      if (!file) continue;
      await fs.mkdir(file.targetDir, { recursive: true });
      await fs.writeFile(file.path, file.content, 'utf8');
    }

    return { written: writableTargets };
  }

  private buildInstallFiles(): InstallFile[] {
    const locations = this.buildLocations();
    const skillContent = stripFrontmatter(generateGraphNavigation());
    const referenceContent = generateGraphReference();

    return locations.flatMap((location) => [
      {
        path: path.join(location.targetDir, location.skillFileName),
        parentDir: location.parentDir,
        targetDir: location.targetDir,
        content: skillContent,
      },
      {
        path: path.join(location.targetDir, 'REFERENCE-graph.md'),
        parentDir: location.parentDir,
        targetDir: location.targetDir,
        content: referenceContent,
      },
    ]);
  }

  private buildLocations(): InstallLocation[] {
    const copilotSkills = path.join(this.homeDir, '.copilot', 'skills');
    const claudeSkills = path.join(this.homeDir, '.claude', 'skills');
    const cursorRules = path.join(this.homeDir, '.cursor', 'rules');

    return [
      {
        parentDir: copilotSkills,
        targetDir: path.join(copilotSkills, 'speckit-graph'),
        skillFileName: 'SKILL.md',
      },
      {
        parentDir: claudeSkills,
        targetDir: path.join(claudeSkills, 'speckit-graph'),
        skillFileName: 'SKILL.md',
      },
      {
        parentDir: cursorRules,
        targetDir: cursorRules,
        skillFileName: 'speckit-graph.md',
      },
    ];
  }

  private async inspectTarget(file: InstallFile): Promise<InstallTarget> {
    if (!(await directoryExists(file.parentDir))) {
      return { path: file.path, action: 'skip', reason: 'parent directory not found' };
    }

    try {
      const currentContent = await fs.readFile(file.path);
      if (hash(currentContent) === hash(Buffer.from(file.content, 'utf8'))) {
        return { path: file.path, action: 'skip', reason: 'identical content' };
      }
      return { path: file.path, action: 'update', reason: 'hash diff' };
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return { path: file.path, action: 'create' };
      }
      throw error;
    }
  }
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    return (await fs.stat(dirPath)).isDirectory();
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return false;
    throw error;
  }
}

function hash(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
