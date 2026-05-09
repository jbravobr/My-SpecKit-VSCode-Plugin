import { readdir, readFile } from 'node:fs/promises';
import * as path from 'path';
import { TechStackDetection } from '../../../../src/fix/Fix';
import { IWorkspace } from '../../../../src/generator/utils/IWorkspace';
import { detectAllStacks } from '../../../../src/generator/utils/stackDetector';
import { SpecStatus } from '../../../../src/story/Story';

const STATUS_PRIORITY: Record<string, number> = {
  review: 4,
  'in-progress': 3,
  blocked: 2,
  open: 1,
};

function specSortKey(filename: string): number {
  const tsMatch = /(\d{8})-(\d{4})\.md$/.exec(filename);
  if (tsMatch) {
    const sortable = parseInt(tsMatch[1] + tsMatch[2], 10);
    const isFix = filename.startsWith('FIX-') ? 0.5 : 0;
    return sortable + isFix;
  }
  const seqMatch = /(\d+)\.md$/.exec(filename);
  const id = seqMatch ? parseInt(seqMatch[1], 10) : 0;
  const isFix = filename.startsWith('FIX-') ? 0.5 : 0;
  return id + isFix;
}

async function readSpecStatus(filePath: string): Promise<SpecStatus> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const metaMatch = /<!--\s*metadata\s*([\s\S]*?)-->/.exec(content);
    if (!metaMatch) return 'open';
    const statusMatch = /^status:\s*(.+)$/m.exec(metaMatch[1]);
    if (!statusMatch) return 'open';
    const s = statusMatch[1].trim() as SpecStatus;
    const valid = new Set(['open', 'in-progress', 'review', 'blocked', 'done', 'cancelled']);
    return valid.has(s) ? s : 'open';
  } catch {
    return 'open';
  }
}

const nodeStackFs = {
  async readDirectory(dirPath: string) {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isFile: e.isFile(),
      }));
    } catch {
      return [];
    }
  },
  async readFile(filePath: string): Promise<string> {
    return readFile(filePath, 'utf-8');
  },
  joinPath(...segments: string[]): string {
    return path.join(...segments);
  },
};

export function createNodeWorkspace(workspaceRoot: string): IWorkspace {
  return {
    getWorkspaceRoot(): string | undefined {
      return workspaceRoot;
    },

    async listStoryFiles(dirPath: string): Promise<string[]> {
      try {
        const entries = await readdir(dirPath);
        return entries.filter(
          (name) => (name.startsWith('US-') || name.startsWith('STORY-')) && name.endsWith('.md'),
        );
      } catch {
        return [];
      }
    },

    async listFixFiles(dirPath: string): Promise<string[]> {
      try {
        const entries = await readdir(dirPath);
        return entries.filter((name) => name.startsWith('FIX-') && name.endsWith('.md'));
      } catch {
        return [];
      }
    },

    async getActiveStoryPath(): Promise<string | undefined> {
      const specDir = path.join(workspaceRoot, '.speckit');
      const entries = await readdir(specDir).catch(() => [] as string[]);
      const files = entries.filter(
        (name) => (name.startsWith('US-') || name.startsWith('STORY-')) && name.endsWith('.md'),
      );
      if (files.length === 0) return undefined;
      const sorted = files.sort();
      return path.join(specDir, sorted[sorted.length - 1]);
    },

    async getActiveSpecPath(): Promise<string | undefined> {
      const specDir = path.join(workspaceRoot, '.speckit');
      const allEntries = await readdir(specDir).catch(() => [] as string[]);
      const storyFiles = allEntries.filter(
        (name) => (name.startsWith('US-') || name.startsWith('STORY-')) && name.endsWith('.md'),
      );
      const fixFiles = allEntries.filter((name) => name.startsWith('FIX-') && name.endsWith('.md'));
      const allFiles = [...storyFiles, ...fixFiles];
      if (allFiles.length === 0) return undefined;

      const statusResults = await Promise.all(
        allFiles.map(async (name) => {
          const fullPath = path.join(specDir, name);
          const status = await readSpecStatus(fullPath);
          return { name, status };
        }),
      );

      const activeFiles = statusResults
        .filter(({ status }) => status in STATUS_PRIORITY)
        .map(({ name, status }) => ({ name, priority: STATUS_PRIORITY[status] ?? 0 }));

      if (activeFiles.length === 0) return undefined;

      activeFiles.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return specSortKey(b.name) - specSortKey(a.name);
      });
      return path.join(specDir, activeFiles[0].name);
    },

    async detectTechStack(): Promise<TechStackDetection> {
      const all = await detectAllStacks(workspaceRoot, nodeStackFs);
      if (all.length === 0) throw new Error('Stack não detectada automaticamente.');
      return all[0];
    },

    async detectAllTechStacks(): Promise<TechStackDetection[]> {
      return detectAllStacks(workspaceRoot, nodeStackFs);
    },
  };
}
