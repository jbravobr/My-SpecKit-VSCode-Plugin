import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { handleApplyCommand } from '../../../src/participant/commands/applyCommand';
import { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import { IWorkspace } from '../../../src/generator/utils/IWorkspace';

const fixturesDir = resolve(__dirname, '../../fixtures');
const completeStoryMd = readFileSync(resolve(fixturesDir, 'story-complete.md'), 'utf-8');
const partialStoryMd = readFileSync(resolve(fixturesDir, 'story-partial.md'), 'utf-8');
const completeFixMd = readFileSync(resolve(fixturesDir, 'fix-complete.md'), 'utf-8');
const partialFixMd = readFileSync(resolve(fixturesDir, 'fix-partial.md'), 'utf-8');

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

function createMockWorkspace(specPath = 'C:\\workspace\\.speckit\\STORY-001.md'): IWorkspace {
  return {
    getWorkspaceRoot: vi.fn().mockReturnValue('C:\\workspace'),
    listStoryFiles: vi.fn().mockResolvedValue(['STORY-001.md']),
    listFixFiles: vi.fn().mockResolvedValue([]),
    getActiveStoryPath: vi.fn().mockResolvedValue(specPath),
    getActiveSpecPath: vi.fn().mockResolvedValue(specPath),
    detectTechStack: vi.fn().mockResolvedValue({ language: 'typescript', framework: 'react', target: 'frontend', confidence: 'high', source: 'package.json' }),
  };
}

describe('handleApplyCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when story is invalid with gap list', async () => {
    const stream = createMockStream();
    const fs = createMockFs(partialStoryMd);
    const workspace = createMockWorkspace();

    await handleApplyCommand({} as any, stream as any, {} as any, fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('incompleta');
    expect(output).toContain('[');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('generates config when story is valid', async () => {
    const stream = createMockStream();
    const fs = createMockFs(completeStoryMd);
    const workspace = createMockWorkspace();

    await handleApplyCommand({} as any, stream as any, {} as any, fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('arquivo(s) gerado(s)');
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('shows agent instruction when story is valid', async () => {
    const stream = createMockStream();
    const fs = createMockFs(completeStoryMd);
    const workspace = createMockWorkspace();

    await handleApplyCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('/implement');
    expect(stream.getAllMarkdown()).toContain('Agente');
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

    await handleApplyCommand({} as any, stream as any, {} as any, createMockFs(), workspace);

    expect(stream.getAllMarkdown()).toContain('workspace');
  });

  it('shows error when no active spec is found', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    (workspace.getActiveSpecPath as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await handleApplyCommand({} as any, stream as any, {} as any, createMockFs(), workspace);

    expect(stream.getAllMarkdown()).toContain('Nenhuma spec');
  });

  it('suggests /validate when story has gaps — no files written', async () => {
    const stream = createMockStream();
    const fs = createMockFs(partialStoryMd);
    const workspace = createMockWorkspace();

    await handleApplyCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('/validate');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  // ── Fix branches ──────────────────────────────────────────────────────────

  it('shows error when fix is invalid — lists gaps and suggests /validate', async () => {
    const stream = createMockStream();
    const fs = createMockFs(partialFixMd);
    const workspace = createMockWorkspace('C:\\workspace\\.speckit\\FIX-002.md');

    await handleApplyCommand({} as any, stream as any, {} as any, fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Fix incompleto');
    expect(output).toContain('[');
    expect(output).toContain('/validate');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('generates config files when fix is valid', async () => {
    const stream = createMockStream();
    const fs = createMockFs(completeFixMd);
    const workspace = createMockWorkspace('C:\\workspace\\.speckit\\FIX-001.md');

    await handleApplyCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('arquivo(s) gerado(s)');
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('shows /fix-implement agent instruction when fix is valid', async () => {
    const stream = createMockStream();
    const fs = createMockFs(completeFixMd);
    const workspace = createMockWorkspace('C:\\workspace\\.speckit\\FIX-001.md');

    await handleApplyCommand({} as any, stream as any, {} as any, fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('/fix-implement');
    expect(output).toContain('Agente');
    expect(output).toContain('fix-implement.prompt.md');
  });

  it('streams error and returns early when generateFixCopilotConfig throws for a valid fix', async () => {
    const stream = createMockStream();
    const fs = createMockFs(completeFixMd);
    const workspace = createMockWorkspace('C:\\workspace\\.speckit\\FIX-001.md');
    (workspace.detectTechStack as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('stack unavailable'));

    await handleApplyCommand({} as any, stream as any, {} as any, fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Erro ao detectar stack');
    expect(output).toContain('stack unavailable');
    expect(output).not.toContain('/fix-implement');
  });
});
