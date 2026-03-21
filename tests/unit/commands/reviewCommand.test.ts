import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleReviewCommand } from '../../../src/participant/commands/reviewCommand';
import { IWorkspace } from '../../../src/generator/utils/IWorkspace';

function createMockStream() {
  const calls: string[] = [];
  return {
    markdown: vi.fn((t: string) => { calls.push(t); }),
    getAllMarkdown: () => calls.join(''),
  };
}

function createMockWorkspace(): IWorkspace {
  return {
    getWorkspaceRoot: vi.fn().mockReturnValue('C:\\workspace'),
    listStoryFiles: vi.fn().mockResolvedValue(['STORY-001.md']),
    listFixFiles: vi.fn().mockResolvedValue([]),
    getActiveStoryPath: vi.fn().mockResolvedValue('C:\\workspace\\.speckit\\STORY-001.md'),
    getActiveSpecPath: vi.fn().mockResolvedValue('C:\\workspace\\.speckit\\STORY-001.md'),
    detectTechStack: vi.fn().mockResolvedValue({ language: 'typescript', framework: 'react', target: 'frontend', confidence: 'high', source: 'package.json' }),
  };
}

describe('handleReviewCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace', async () => {
    const stream = createMockStream();
    const workspace: IWorkspace = {
      getWorkspaceRoot: vi.fn().mockReturnValue(undefined),
      listStoryFiles: vi.fn().mockResolvedValue([]),
      listFixFiles: vi.fn().mockResolvedValue([]),
      getActiveStoryPath: vi.fn().mockResolvedValue(undefined),
      getActiveSpecPath: vi.fn().mockResolvedValue(undefined),
      detectTechStack: vi.fn().mockResolvedValue({ language: 'typescript', framework: 'react', target: 'frontend', confidence: 'high', source: 'package.json' }),
    };

    await handleReviewCommand({} as any, stream as any, {} as any, workspace);

    expect(stream.getAllMarkdown()).toContain('workspace');
  });

  it('shows error when no story found', async () => {
    const stream = createMockStream();
    const workspace: IWorkspace = {
      getWorkspaceRoot: vi.fn().mockReturnValue('C:\\workspace'),
      listStoryFiles: vi.fn().mockResolvedValue([]),
      listFixFiles: vi.fn().mockResolvedValue([]),
      getActiveStoryPath: vi.fn().mockResolvedValue(undefined),
      getActiveSpecPath: vi.fn().mockResolvedValue(undefined),
      detectTechStack: vi.fn().mockResolvedValue({ language: 'typescript', framework: 'react', target: 'frontend', confidence: 'high', source: 'package.json' }),
    };

    await handleReviewCommand({} as any, stream as any, {} as any, workspace);

    expect(stream.getAllMarkdown()).toContain('Nenhuma história');
  });

  it('shows agent instruction with /review command', async () => {
    const stream = createMockStream();
    await handleReviewCommand({} as any, stream as any, {} as any, createMockWorkspace());

    expect(stream.getAllMarkdown()).toContain('/review');
    expect(stream.getAllMarkdown()).toContain('Agente');
  });

  it('shows path to review prompt file', async () => {
    const stream = createMockStream();
    await handleReviewCommand({} as any, stream as any, {} as any, createMockWorkspace());

    expect(stream.getAllMarkdown()).toContain('review.prompt.md');
  });
});
