import * as path from 'path';
import { IFileSystem } from './IFileSystem';

const RE_STORY_FILENAME = /^(US-.+\.md|STORY-.+\.md)$/i;

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '.speckit',
  '.github',
  '.venv',
  '__pycache__',
  '.next',
  '.nuxt',
  'coverage',
  'build',
]);

const MAX_DEPTH = 5;

export interface FoundSpecFile {
  /** Absolute path to the file */
  absolutePath: string;
  /** Path relative to workspace root (forward-slash) */
  relativePath: string;
  /** Just the filename */
  fileName: string;
}

/**
 * Recursively searches the workspace for story spec files matching
 * `US-*.md` or `STORY-*.md`, excluding known non-source directories.
 */
export async function findSpecFiles(
  workspaceRoot: string,
  fs: IFileSystem,
): Promise<FoundSpecFile[]> {
  const results: FoundSpecFile[] = [];
  await walk(workspaceRoot, workspaceRoot, fs, results, 0);
  return results;
}

async function walk(
  dir: string,
  root: string,
  fs: IFileSystem,
  results: FoundSpecFile[],
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  let entries: string[];
  try {
    entries = await fs.listDir(dir);
  } catch {
    return; // silently skip unreadable directories
  }

  const promises: Promise<void>[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);

    if (IGNORED_DIRS.has(entry)) continue;

    if (RE_STORY_FILENAME.test(entry)) {
      const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');
      results.push({ absolutePath: fullPath, relativePath, fileName: entry });
      continue;
    }

    // Check if it's a directory by trying to listDir it (cheap with InMemory, works with real FS)
    // Only recurse if entry has no extension (heuristic to skip files)
    if (!entry.includes('.')) {
      promises.push(walk(fullPath, root, fs, results, depth + 1));
    }
  }

  await Promise.all(promises);
}
