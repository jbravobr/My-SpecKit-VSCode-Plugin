import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { handleStatusCommand } from '../../../src/participant/commands/statusCommand';
import { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import { IWorkspace } from '../../../src/generator/utils/IWorkspace';

const fixturesDir = resolve(__dirname, '../../fixtures');
const completeStoryMd = readFileSync(resolve(fixturesDir, 'story-complete.md'), 'utf-8');

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

function createMockWorkspace(): IWorkspace {
  return {
    getWorkspaceRoot: vi.fn().mockReturnValue('C:\\workspace'),
    listStoryFiles: vi.fn().mockResolvedValue(['STORY-001.md']),
    getActiveStoryPath: vi.fn().mockResolvedValue('C:\\workspace\\.speckit\\STORY-001.md'),
  };
}

describe('handleStatusCommand', () => {
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

    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(), workspace);

    expect(stream.getAllMarkdown()).toContain('workspace');
  });

  it('shows story metadata including title', async () => {
    const stream = createMockStream();
    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(), createMockWorkspace());

    expect(stream.getAllMarkdown()).toContain('Autenticação via OAuth2 com GitHub');
  });

  it('shows language in output', async () => {
    const stream = createMockStream();
    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(), createMockWorkspace());

    expect(stream.getAllMarkdown()).toContain('typescript');
  });

  it('shows framework in output', async () => {
    const stream = createMockStream();
    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(), createMockWorkspace());

    expect(stream.getAllMarkdown()).toContain('react');
  });

  it('shows architecture in output', async () => {
    const stream = createMockStream();
    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(), createMockWorkspace());

    expect(stream.getAllMarkdown()).toContain('hexagonal');
  });
});
