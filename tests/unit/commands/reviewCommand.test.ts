import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleReviewCommand } from '../../../src/participant/commands/reviewCommand';
import { IWorkspace } from '../../../src/generator/utils/IWorkspace';
import { InMemoryFileSystem, WorkspaceStub } from '../../support/fakes';

const STORY_CONTENT = `<!-- metadata
id: 001
title: Test Story
type: story
status: open
-->`;

const FIX_CONTENT = `<!-- metadata
id: 001
title: Test Fix
type: fix
status: open
-->`;

function createMockStream() {
  const calls: string[] = [];
  return {
    markdown: vi.fn((t: string) => { calls.push(t); }),
    getAllMarkdown: () => calls.join(''),
  };
}

function createMockWorkspace(activeSpecPath = 'C:/workspace/.speckit/STORY-001.md'): IWorkspace {
  return {
    getWorkspaceRoot: vi.fn().mockReturnValue('C:/workspace'),
    listStoryFiles: vi.fn().mockResolvedValue(['STORY-001.md']),
    listFixFiles: vi.fn().mockResolvedValue([]),
    getActiveStoryPath: vi.fn().mockResolvedValue(activeSpecPath),
    getActiveSpecPath: vi.fn().mockResolvedValue(activeSpecPath),
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

  it('shows error when no spec found', async () => {
    const stream = createMockStream();
    const workspace: IWorkspace = {
      getWorkspaceRoot: vi.fn().mockReturnValue('C:/workspace'),
      listStoryFiles: vi.fn().mockResolvedValue([]),
      listFixFiles: vi.fn().mockResolvedValue([]),
      getActiveStoryPath: vi.fn().mockResolvedValue(undefined),
      getActiveSpecPath: vi.fn().mockResolvedValue(undefined),
      detectTechStack: vi.fn().mockResolvedValue({ language: 'typescript', framework: 'react', target: 'frontend', confidence: 'high', source: 'package.json' }),
    };

    await handleReviewCommand({} as any, stream as any, {} as any, workspace);

    expect(stream.getAllMarkdown()).toContain('spec');
  });

  it('shows error when review.prompt.md not found for story', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => STORY_CONTENT;
    // prompt file not written — fileExists returns false

    await handleReviewCommand({} as any, stream as any, {} as any, createMockWorkspace(), fs);

    expect(stream.getAllMarkdown()).toContain('review.prompt.md');
    expect(stream.getAllMarkdown()).toContain('/validate');
  });

  it('shows /review agent instruction for story when prompt file exists', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => STORY_CONTENT;
    await fs.writeFile('C:/workspace/.github/prompts/review.prompt.md', '# review');

    await handleReviewCommand({} as any, stream as any, {} as any, createMockWorkspace(), fs);

    expect(stream.getAllMarkdown()).toContain('/review');
    expect(stream.getAllMarkdown()).toContain('review.prompt.md');
    expect(stream.getAllMarkdown()).toContain('Agente');
  });

  it('shows /fix-review agent instruction for fix when prompt file exists', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => FIX_CONTENT;
    await fs.writeFile('C:/workspace/.github/prompts/fix-review.prompt.md', '# fix-review');

    await handleReviewCommand(
      {} as any, stream as any, {} as any,
      createMockWorkspace('C:/workspace/.speckit/FIX-001.md'),
      fs,
    );

    expect(stream.getAllMarkdown()).toContain('/fix-review');
    expect(stream.getAllMarkdown()).toContain('fix-review.prompt.md');
    expect(stream.getAllMarkdown()).not.toContain('/fix-implement');
  });

  it('shows fix-review.prompt.md missing error for fix when prompt file not found', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => FIX_CONTENT;
    // fix-review.prompt.md not written

    await handleReviewCommand(
      {} as any, stream as any, {} as any,
      createMockWorkspace('C:/workspace/.speckit/FIX-001.md'),
      fs,
    );

    expect(stream.getAllMarkdown()).toContain('fix-review.prompt.md');
    expect(stream.getAllMarkdown()).toContain('/validate');
  });
});
