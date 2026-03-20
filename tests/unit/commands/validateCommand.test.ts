import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { handleValidateCommand } from '../../../src/participant/commands/validateCommand';
import { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import { IWorkspace } from '../../../src/generator/utils/IWorkspace';

const fixturesDir = resolve(__dirname, '../../fixtures');
const completeStoryMd = readFileSync(resolve(fixturesDir, 'story-complete.md'), 'utf-8');
const partialStoryMd = readFileSync(resolve(fixturesDir, 'story-partial.md'), 'utf-8');

function createMockStream() {
  const calls: string[] = [];
  return {
    markdown: vi.fn((t: string) => { calls.push(t); }),
    getAllMarkdown: () => calls.join(''),
  };
}

function createMockFs(content: string = completeStoryMd): IFileSystem {
  return {
    ensureDir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(content),
    fileExists: vi.fn().mockResolvedValue(true),
  };
}

function createMockWorkspace(storyPath = 'C:\\workspace\\.speckit\\STORY-001.md'): IWorkspace {
  return {
    getWorkspaceRoot: vi.fn().mockReturnValue('C:\\workspace'),
    listStoryFiles: vi.fn().mockResolvedValue(['STORY-001.md']),
    getActiveStoryPath: vi.fn().mockResolvedValue(storyPath),
  };
}

describe('handleValidateCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace', async () => {
    const stream = createMockStream();
    const workspace: IWorkspace = {
      getWorkspaceRoot: vi.fn().mockReturnValue(undefined),
      listStoryFiles: vi.fn().mockResolvedValue([]),
      getActiveStoryPath: vi.fn().mockResolvedValue(undefined),
    };

    await handleValidateCommand({} as any, stream as any, {} as any, createMockFs(), workspace);

    expect(stream.getAllMarkdown()).toContain('workspace');
  });

  it('shows error when no story found', async () => {
    const stream = createMockStream();
    const workspace: IWorkspace = {
      getWorkspaceRoot: vi.fn().mockReturnValue('C:\\workspace'),
      listStoryFiles: vi.fn().mockResolvedValue([]),
      getActiveStoryPath: vi.fn().mockResolvedValue(undefined),
    };

    await handleValidateCommand({} as any, stream as any, {} as any, createMockFs(), workspace);

    expect(stream.getAllMarkdown()).toContain('Nenhuma história');
  });

  it('shows gap-filling prompt for invalid story', async () => {
    const stream = createMockStream();
    const fs = createMockFs(partialStoryMd);
    const workspace = createMockWorkspace();

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('incompleta');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('shows complete flow including review session for valid story', async () => {
    const stream = createMockStream();
    const fs = createMockFs(completeStoryMd);
    const workspace = createMockWorkspace();

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('/review');
    expect(stream.getAllMarkdown()).toContain('Sessão B');
  });

  it('generates config and shows agent instruction for valid story', async () => {
    const stream = createMockStream();
    const fs = createMockFs(completeStoryMd);
    const workspace = createMockWorkspace();

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('DoR atingido');
    expect(stream.getAllMarkdown()).toContain('/implement');
    expect(stream.getAllMarkdown()).toContain('Agente');
    expect(fs.writeFile).toHaveBeenCalled();
  });
});
