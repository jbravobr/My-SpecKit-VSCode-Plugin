import { describe, expect, it } from 'vitest';
import { findSpecFiles } from '../../../../src/generator/utils/findSpecFiles';
import { InMemoryFileSystem } from '../../../support/fakes';

function seedFs(files: Record<string, string>): InMemoryFileSystem {
  const fs = new InMemoryFileSystem();
  for (const [path, content] of Object.entries(files)) {
    fs.writeFile(path, content);
  }
  return fs;
}

describe('findSpecFiles', () => {
  it('finds STORY-*.md files at root level', async () => {
    const fs = seedFs({
      'C:/workspace/STORY-001.md': '# Story',
      'C:/workspace/README.md': '# Readme',
    });
    const results = await findSpecFiles('C:/workspace', fs);

    expect(results).toHaveLength(1);
    expect(results[0].fileName).toBe('STORY-001.md');
    expect(results[0].relativePath).toBe('STORY-001.md');
  });

  it('finds US-*.md files', async () => {
    const fs = seedFs({
      'C:/workspace/US-AUTH-001.md': '# Story',
    });
    const results = await findSpecFiles('C:/workspace', fs);

    expect(results).toHaveLength(1);
    expect(results[0].fileName).toBe('US-AUTH-001.md');
  });

  it('is case-insensitive for filename matching', async () => {
    const fs = seedFs({
      'C:/workspace/story-001.md': '# Story',
      'C:/workspace/us-Abc.md': '# Story',
    });
    const results = await findSpecFiles('C:/workspace', fs);

    expect(results).toHaveLength(2);
  });

  it('finds files in nested subdirectories', async () => {
    const fs = seedFs({
      'C:/workspace/docs/specs/STORY-001.md': '# Story',
    });
    const results = await findSpecFiles('C:/workspace', fs);

    expect(results).toHaveLength(1);
    expect(results[0].relativePath).toBe('docs/specs/STORY-001.md');
  });

  it('ignores files inside .speckit/', async () => {
    // The walk function skips IGNORED_DIRS which includes .speckit
    // But findSpecFiles walks from root so .speckit directory is skipped
    const fs = seedFs({
      'C:/workspace/.speckit/STORY-001.md': '# Already in speckit',
      'C:/workspace/STORY-002.md': '# Outside',
    });
    // .speckit is in IGNORED_DIRS, but InMemoryFileSystem lists it as an entry starting with "."
    // The IGNORED_DIRS check matches exact names, so ".speckit" is in the set
    const results = await findSpecFiles('C:/workspace', fs);

    // Only STORY-002 should be found (root level), .speckit is ignored
    const fileNames = results.map((r) => r.fileName);
    expect(fileNames).toContain('STORY-002.md');
    expect(fileNames).not.toContain('STORY-001.md');
  });

  it('ignores node_modules and other excluded directories', async () => {
    const fs = seedFs({
      'C:/workspace/node_modules/STORY-001.md': '# In deps',
      'C:/workspace/dist/STORY-002.md': '# In build',
      'C:/workspace/src/STORY-003.md': '# In source',
    });
    const results = await findSpecFiles('C:/workspace', fs);

    const fileNames = results.map((r) => r.fileName);
    expect(fileNames).not.toContain('STORY-001.md');
    expect(fileNames).not.toContain('STORY-002.md');
    expect(fileNames).toContain('STORY-003.md');
  });

  it('returns empty array for workspace with no matching files', async () => {
    const fs = seedFs({
      'C:/workspace/README.md': '# Readme',
      'C:/workspace/package.json': '{}',
    });
    const results = await findSpecFiles('C:/workspace', fs);

    expect(results).toEqual([]);
  });

  it('does not crash on empty workspace', async () => {
    const fs = new InMemoryFileSystem();
    const results = await findSpecFiles('C:/workspace', fs);

    expect(results).toEqual([]);
  });
});
