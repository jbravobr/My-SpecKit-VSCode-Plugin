import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { handleValidateCommand } from '../../../src/participant/commands/validateCommand';
import { InMemoryFileSystem, WorkspaceStub } from '../../support/fakes';

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

describe('handleValidateCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace root is available', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    // Override getWorkspaceRoot to return undefined
    workspace.getWorkspaceRoot = () => undefined;

    await handleValidateCommand({} as any, stream as any, {} as any, new InMemoryFileSystem(), workspace);

    expect(stream.getAllMarkdown()).toContain('workspace');
  });

  it('shows error when no open spec file is found', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ activeSpecPath: undefined as unknown as string });
    workspace.getActiveSpecPath = async () => undefined;

    await handleValidateCommand({} as any, stream as any, {} as any, new InMemoryFileSystem(), workspace);

    expect(stream.getAllMarkdown()).toContain('Nenhuma spec');
  });

  it('shows gap-filling prompt for invalid (partial) story — no files written', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => partialStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('incompleta');
    expect(fs.writtenPaths()).toHaveLength(0);
  });

  it('generates config files for a valid story', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(fs.writtenPaths().length).toBeGreaterThan(0);
  });

  it('shows DoR success and /implement instruction for valid story', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('DoR atingido');
    expect(stream.getAllMarkdown()).toContain('/implement');
  });

  it('shows Session B / review instruction for valid story', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('/review');
    expect(stream.getAllMarkdown()).toContain('Sessão B');
  });
});
