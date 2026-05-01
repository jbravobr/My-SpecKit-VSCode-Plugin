import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleInitCommand } from '../../../src/participant/commands/initCommand';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

function seedFs(files: Record<string, string>): InMemoryFileSystem {
  const fs = new InMemoryFileSystem();
  for (const [path, content] of Object.entries(files)) {
    fs.writeFile(path, content);
  }
  return fs;
}

describe('handleInitCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace is available', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    workspace.getWorkspaceRoot = () => undefined;

    await handleInitCommand(
      createMockRequest(''),
      stream,
      createMockToken(),
      new InMemoryFileSystem(),
      workspace,
    );

    expect(stream.getAllMarkdown()).toContain('workspace');
  });

  it('creates .speckit/ and reports when no scattered files found', async () => {
    const fs = new InMemoryFileSystem();
    const workspace = new WorkspaceStub();
    const stream = createMockStream();

    await handleInitCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('inicializado');
    expect(output).toContain('Nenhum arquivo');
  });

  it('reports .speckit/ as already existing when present', async () => {
    // InMemoryFileSystem.fileExists checks exact path key; seed the dir path itself
    const fs = new InMemoryFileSystem();
    await fs.writeFile('C:/workspace/.speckit', '');
    const workspace = new WorkspaceStub();
    const stream = createMockStream();

    await handleInitCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('já existia');
  });

  it('moves scattered story files into .speckit/', async () => {
    const fs = seedFs({
      'C:/workspace/docs/STORY-001.md': '# Story 001',
      'C:/workspace/STORY-002.md': '# Story 002',
    });
    const workspace = new WorkspaceStub();
    const stream = createMockStream();

    await handleInitCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('2');
    expect(output).toContain('movido');

    // Files should exist in .speckit/ now
    expect(await fs.fileExists('C:/workspace/.speckit/STORY-001.md')).toBe(true);
    expect(await fs.fileExists('C:/workspace/.speckit/STORY-002.md')).toBe(true);

    // Original files should be deleted
    expect(await fs.fileExists('C:/workspace/docs/STORY-001.md')).toBe(false);
    expect(await fs.fileExists('C:/workspace/STORY-002.md')).toBe(false);
  });

  it('detects conflicts and does not overwrite existing files', async () => {
    const fs = seedFs({
      'C:/workspace/STORY-001.md': '# Scattered',
      'C:/workspace/.speckit/STORY-001.md': '# Already there',
    });
    const workspace = new WorkspaceStub();
    const stream = createMockStream();

    await handleInitCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('conflito');

    // Original should NOT be deleted
    expect(await fs.fileExists('C:/workspace/STORY-001.md')).toBe(true);
    // Existing file should NOT be overwritten
    expect(await fs.readFile('C:/workspace/.speckit/STORY-001.md')).toBe('# Already there');
  });

  it('does not move files already inside .speckit/', async () => {
    const fs = seedFs({
      'C:/workspace/.speckit/STORY-001.md': '# Already in place',
    });
    const workspace = new WorkspaceStub();
    const stream = createMockStream();

    await handleInitCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Nenhum arquivo');
  });

  it('handles US-*.md files the same way', async () => {
    const fs = seedFs({
      'C:/workspace/US-AUTH-001.md': '# US file',
    });
    const workspace = new WorkspaceStub();
    const stream = createMockStream();

    await handleInitCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(await fs.fileExists('C:/workspace/.speckit/US-AUTH-001.md')).toBe(true);
    expect(await fs.fileExists('C:/workspace/US-AUTH-001.md')).toBe(false);
  });
});
