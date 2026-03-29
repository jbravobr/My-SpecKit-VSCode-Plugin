import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { handleValidateCommand } from '../../../src/participant/commands/validateCommand';
import { InMemoryFileSystem, WorkspaceStub } from '../../support/fakes';

vi.mock('../../../src/generator/utils/EnvironmentChecker', () => ({
  checkEnvironment: vi.fn().mockReturnValue({ tools: [], stackLanguage: 'typescript' }),
  formatEnvCheckInline: vi.fn().mockReturnValue(''),
}));

import { checkEnvironment, formatEnvCheckInline } from '../../../src/generator/utils/EnvironmentChecker';

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

describe('handleValidateCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkEnvironment).mockReturnValue({ tools: [], stackLanguage: 'typescript' });
    vi.mocked(formatEnvCheckInline).mockReturnValue('');
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

  it('writes gap-fill prompt file and instructs Copilot Agent for invalid (partial) story', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => partialStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('incompleta');
    expect(fs.hasFile('gap-fill.prompt.md')).toBe(true);
    expect(stream.getAllMarkdown()).toContain('gap-fill.prompt.md');
    expect(stream.getAllMarkdown()).toContain('Copilot Agent');
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

  // ── Fix branches ──────────────────────────────────────────────────────────

  it('writes gap-fill.prompt.md and instructs Copilot Agent for invalid (partial) fix', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => partialFixMd;
    const workspace = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/FIX-002.md' });

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Fix incompleto');
    expect(fs.hasFile('gap-fill.prompt.md')).toBe(true);
    expect(stream.getAllMarkdown()).toContain('gap-fill.prompt.md');
    expect(stream.getAllMarkdown()).toContain('Copilot Agent');
  });

  it('generates config files for a valid fix', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeFixMd;
    const workspace = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/FIX-001.md' });

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Fix válido');
    expect(stream.getAllMarkdown()).toContain('arquivo(s) gerado(s)');
    expect(fs.writtenPaths().length).toBeGreaterThan(0);
  });

  it('shows /fix-implement and Session B instruction for a valid fix', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeFixMd;
    const workspace = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/FIX-001.md' });

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('/fix-implement');
    expect(stream.getAllMarkdown()).toContain('Sessão B');
  });

  it('streams error and returns early when generateFixCopilotConfig throws', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeFixMd;
    const workspace = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/FIX-001.md' });
    workspace.detectTechStack = async () => { throw new Error('stack detection failed'); };

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Erro ao detectar stack');
    expect(stream.getAllMarkdown()).toContain('stack detection failed');
    expect(stream.getAllMarkdown()).not.toContain('/fix-implement');
  });

  // ── Environment check integration ─────────────────────────────────────────

  it('calls checkEnvironment with story language after valid story is generated', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(checkEnvironment).toHaveBeenCalledWith(expect.objectContaining({ language: 'typescript' }));
  });

  it('streams env check result after valid story config is generated', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();
    vi.mocked(formatEnvCheckInline).mockReturnValue('✅ **Ambiente verificado** — Git 2.43.0, Node.js 20.11.0 disponíveis.\n\n');

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Ambiente verificado');
  });

  it('streams missing tools warning after valid story when tools are absent', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();
    vi.mocked(formatEnvCheckInline).mockReturnValue('⚠️ **Ferramentas ausentes para implementação:**\n\n- **Git**: instalar em https://git-scm.com/downloads\n\n');

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Ferramentas ausentes');
    expect(stream.getAllMarkdown()).toContain('Git');
  });

  it('calls checkEnvironment with detected stack after valid fix config is generated', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeFixMd;
    const workspace = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/FIX-001.md' });

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(checkEnvironment).toHaveBeenCalledWith(expect.objectContaining({ language: 'typescript' }));
  });

  it('streams env check result after valid fix config is generated', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeFixMd;
    const workspace = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/FIX-001.md' });
    vi.mocked(formatEnvCheckInline).mockReturnValue('✅ **Ambiente verificado** — Git 2.43.0 disponível.\n\n');

    await handleValidateCommand({} as any, stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Ambiente verificado');
  });
});
