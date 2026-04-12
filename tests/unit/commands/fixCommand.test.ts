import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import { IWorkspace } from '../../../src/generator/utils/IWorkspace';
import { handleFixCommand } from '../../../src/participant/commands/fixCommand';

vi.mock('vscode', () => ({
  workspace: { openTextDocument: vi.fn().mockResolvedValue({}) },
  window: { showTextDocument: vi.fn().mockResolvedValue(undefined) },
}));

function createMockStream() {
  const calls: string[] = [];
  return {
    markdown: vi.fn((t: string) => {
      calls.push(t);
    }),
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
    listDir: vi.fn().mockResolvedValue([]),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    deleteDir: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockWorkspace(overrides: Partial<IWorkspace> = {}): IWorkspace {
  return {
    getWorkspaceRoot: vi.fn().mockReturnValue('C:\\workspace'),
    listStoryFiles: vi.fn().mockResolvedValue([]),
    listFixFiles: vi.fn().mockResolvedValue([]),
    getActiveStoryPath: vi.fn().mockResolvedValue(undefined),
    getActiveSpecPath: vi.fn().mockResolvedValue(undefined),
    detectTechStack: vi.fn().mockResolvedValue({
      language: 'typescript',
      framework: 'react',
      target: 'frontend',
      projectStage: 'brownfield',
      confidence: 'high',
      source: 'package.json',
    }),
    ...overrides,
  };
}

describe('handleFixCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace is open', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ getWorkspaceRoot: vi.fn().mockReturnValue(undefined) });
    const fs = createMockFs();

    await handleFixCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('creates FIX-001.md when no fixes exist', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ listFixFiles: vi.fn().mockResolvedValue([]) });
    const fs = createMockFs();

    await handleFixCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('FIX-001.md'),
      expect.any(String),
    );
    expect(stream.getAllMarkdown()).toContain('FIX-001');
  });

  it('creates FIX-002.md when FIX-001.md already exists', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({
      listFixFiles: vi.fn().mockResolvedValue(['FIX-001.md']),
    });
    const fs = createMockFs();

    await handleFixCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('FIX-002.md'),
      expect.any(String),
    );
  });

  it('calls ensureDir for the .speckit directory', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    const fs = createMockFs();

    await handleFixCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(fs.ensureDir).toHaveBeenCalledWith(expect.stringContaining('.speckit'));
  });

  it('writes a template with type: fix in metadata', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    const fs = createMockFs();

    await handleFixCommand({} as any, stream as any, {} as any, fs, workspace);

    const writtenContent = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(writtenContent).toContain('type: fix');
  });

  it('success message includes /validate instruction', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ listFixFiles: vi.fn().mockResolvedValue([]) });
    const fs = createMockFs();

    await handleFixCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('/validate');
  });

  it('shows error when writeFile fails', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    const fs = createMockFs();
    (fs.writeFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('EACCES: permission denied'),
    );

    await handleFixCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Erro ao salvar o fix');
    expect(stream.getAllMarkdown()).toContain('permission denied');
  });
});
