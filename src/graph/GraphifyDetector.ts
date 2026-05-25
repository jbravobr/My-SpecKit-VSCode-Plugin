import { stat } from 'node:fs/promises';
import path from 'node:path';

export interface GraphifyDetection {
  found: boolean;
  sources: string[];
}

export type GraphifyDetectionResult = GraphifyDetection;

/** Detects graphify artifacts or skills already present in the workspace. */
export class GraphifyDetector {
  /** Finds graphify output and supported graphify skill files in deterministic order. */
  async detect(workspaceRoot: string): Promise<GraphifyDetection> {
    const candidates: Array<{ path: string; kind: 'directory' | 'file' }> = [
      { path: path.join(workspaceRoot, 'graphify-out'), kind: 'directory' },
      { path: path.join(workspaceRoot, '.claude', 'skills', 'graphify', 'SKILL.md'), kind: 'file' },
      { path: path.join(workspaceRoot, '.agents', 'skills', 'graphify', 'SKILL.md'), kind: 'file' },
      {
        path: path.join(workspaceRoot, '.copilot', 'skills', 'graphify', 'SKILL.md'),
        kind: 'file',
      },
    ];

    const sources: string[] = [];

    for (const candidate of candidates) {
      if (await this.existsAs(candidate.path, candidate.kind)) {
        sources.push(candidate.path);
      }
    }

    return { found: sources.length > 0, sources };
  }

  private async existsAs(candidate: string, kind: 'directory' | 'file'): Promise<boolean> {
    try {
      const stats = await stat(candidate);
      return kind === 'directory' ? stats.isDirectory() : stats.isFile();
    } catch {
      return false;
    }
  }
}
