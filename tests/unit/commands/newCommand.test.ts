import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleNewCommand } from '../../../src/participant/commands/newCommand';
import { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import { IWorkspace } from '../../../src/generator/utils/IWorkspace';

function createMockStream() {
  const calls: string[] = [];
  return {
    markdown: vi.fn((t: string) => { calls.push(t); }),
    getCalls: () => calls,
    getAllMarkdown: () => calls.join(''),
  };
}

function createMockFs(): IFileSystem {
  return {
    ensureDir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    fileExists: vi.fn().mockResolvedValue(false),
  };
}

function createMockWorkspace(overrides: Partial<IWorkspace> = {}): IWorkspace {
  return {
    getWorkspaceRoot: vi.fn().mockReturnValue('C:\\workspace'),
    listStoryFiles: vi.fn().mockResolvedValue([]),
    listFixFiles: vi.fn().mockResolvedValue([]),
    getActiveStoryPath: vi.fn().mockResolvedValue(undefined),
    getActiveSpecPath: vi.fn().mockResolvedValue(undefined),
    detectTechStack: vi.fn().mockResolvedValue({ language: 'typescript', framework: 'react', target: 'frontend', confidence: 'high', source: 'package.json' }),
    ...overrides,
  };
}

describe('handleNewCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace is open', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ getWorkspaceRoot: vi.fn().mockReturnValue(undefined) });
    const fs = createMockFs();

    await handleNewCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('creates STORY-001.md when no stories exist', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ listStoryFiles: vi.fn().mockResolvedValue([]) });
    const fs = createMockFs();

    await handleNewCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('STORY-001.md'),
      expect.any(String),
    );
    expect(stream.getAllMarkdown()).toContain('STORY-001');
  });

  it('creates STORY-002.md when STORY-001.md already exists', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({
      listStoryFiles: vi.fn().mockResolvedValue(['STORY-001.md']),
    });
    const fs = createMockFs();

    await handleNewCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('STORY-002.md'),
      expect.any(String),
    );
  });

  it('calls ensureDir for the .speckit directory', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    const fs = createMockFs();

    await handleNewCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(fs.ensureDir).toHaveBeenCalledWith(expect.stringContaining('.speckit'));
  });
});
