import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { handleStatusCommand } from '../../../src/participant/commands/statusCommand';
import { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import { IWorkspace } from '../../../src/generator/utils/IWorkspace';

const fixturesDir = resolve(__dirname, '../../fixtures');
const completeStoryMd = readFileSync(resolve(fixturesDir, 'story-complete.md'), 'utf-8');
const partialStoryMd = readFileSync(resolve(fixturesDir, 'story-partial.md'), 'utf-8');
const completeFixMd = readFileSync(resolve(fixturesDir, 'fix-complete.md'), 'utf-8');
const fixEmptyMd = readFileSync(resolve(fixturesDir, 'fix-empty.md'), 'utf-8');

const doneStoryMd = '<!-- metadata\nid: 001\ntitle: Done Story\nstatus: done\ntype: story\n-->';
const doneFixMd = '<!-- metadata\nid: 001\ntitle: Done Fix\ntype: fix\nstatus: done\n-->';

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
    listFixFiles: vi.fn().mockResolvedValue([]),
    getActiveStoryPath: vi.fn().mockResolvedValue('C:\\workspace\\.speckit\\STORY-001.md'),
    getActiveSpecPath: vi.fn().mockResolvedValue('C:\\workspace\\.speckit\\STORY-001.md'),
    detectTechStack: vi.fn().mockResolvedValue({ language: 'typescript', framework: 'react', target: 'frontend', confidence: 'high', source: 'package.json' }),
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
      listFixFiles: vi.fn().mockResolvedValue([]),
      getActiveStoryPath: vi.fn().mockResolvedValue(undefined),
      getActiveSpecPath: vi.fn().mockResolvedValue(undefined),
      detectTechStack: vi.fn().mockResolvedValue({ language: 'typescript', framework: 'react', target: 'frontend', confidence: 'high', source: 'package.json' }),
    };

    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(), workspace);

    expect(stream.getAllMarkdown()).toContain('workspace');
  });

  it('shows story title in output', async () => {
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

  it('shows Stories and Fixes sections', async () => {
    const stream = createMockStream();
    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(), createMockWorkspace());

    expect(stream.getAllMarkdown()).toContain('Stories abertas');
    expect(stream.getAllMarkdown()).toContain('Fixes abertos');
  });

  it('shows nenhum when no fixes exist', async () => {
    const stream = createMockStream();
    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(), createMockWorkspace());

    expect(stream.getAllMarkdown()).toContain('nenhum');
  });

  // ── Story branches ────────────────────────────────────────────────────────

  it('skips story with status done', async () => {
    const stream = createMockStream();
    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(doneStoryMd), createMockWorkspace());

    const output = stream.getAllMarkdown();
    expect(output).not.toContain('Done Story');
    expect(output).toContain('Stories abertas (0)');
    expect(output).toContain('nenhuma');
  });

  it('shows ✅ icon for a valid story', async () => {
    const stream = createMockStream();
    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(completeStoryMd), createMockWorkspace());

    expect(stream.getAllMarkdown()).toContain('✅');
  });

  it('shows ⚠️ icon and gap count for an invalid story', async () => {
    const stream = createMockStream();
    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(partialStoryMd), createMockWorkspace());

    const output = stream.getAllMarkdown();
    expect(output).toContain('⚠️');
    expect(output).toContain('lacuna(s)');
  });

  it('shows "erro ao ler arquivo" when readFile throws for a story', async () => {
    const stream = createMockStream();
    const fs = createMockFs();
    (fs.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disk error'));

    await handleStatusCommand({} as any, stream as any, {} as any, fs, createMockWorkspace());

    expect(stream.getAllMarkdown()).toContain('erro ao ler arquivo');
  });

  it('shows "nenhuma" when story list is empty', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    (workspace.listStoryFiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (workspace.listFixFiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(), workspace);

    expect(stream.getAllMarkdown()).toContain('nenhuma');
  });

  // ── Fix branches ──────────────────────────────────────────────────────────

  it('skips fix with status done', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    (workspace.listStoryFiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (workspace.listFixFiles as ReturnType<typeof vi.fn>).mockResolvedValue(['FIX-001.md']);

    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(doneFixMd), workspace);

    const output = stream.getAllMarkdown();
    expect(output).not.toContain('Done Fix');
    expect(output).toContain('Fixes abertos (0)');
    expect(output).toContain('nenhum');
  });

  it('shows severity tag when fix has a severity', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    (workspace.listStoryFiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (workspace.listFixFiles as ReturnType<typeof vi.fn>).mockResolvedValue(['FIX-001.md']);

    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(completeFixMd), workspace);

    expect(stream.getAllMarkdown()).toContain('[high]');
  });

  it('omits severity tag when fix has no severity', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    (workspace.listStoryFiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (workspace.listFixFiles as ReturnType<typeof vi.fn>).mockResolvedValue(['FIX-001.md']);

    await handleStatusCommand({} as any, stream as any, {} as any, createMockFs(fixEmptyMd), workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('🐛');
    expect(output).not.toMatch(/\[(critical|high|medium|low)\]/);
  });

  it('shows "erro ao ler arquivo" when readFile throws for a fix', async () => {
    const stream = createMockStream();
    const fs = createMockFs();
    (fs.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disk error'));
    const workspace = createMockWorkspace();
    (workspace.listStoryFiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (workspace.listFixFiles as ReturnType<typeof vi.fn>).mockResolvedValue(['FIX-001.md']);

    await handleStatusCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('erro ao ler arquivo');
  });
});
