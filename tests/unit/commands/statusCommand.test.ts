import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleStatusCommand } from '../../../src/participant/commands/statusCommand';
import {
  createMockFs,
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

const fixturesDir = resolve(__dirname, '../../fixtures');
const completeStoryMd = readFileSync(resolve(fixturesDir, 'story-complete.md'), 'utf-8');
const partialStoryMd = readFileSync(resolve(fixturesDir, 'story-partial.md'), 'utf-8');
const completeFixMd = readFileSync(resolve(fixturesDir, 'fix-complete.md'), 'utf-8');
const fixEmptyMd = readFileSync(resolve(fixturesDir, 'fix-empty.md'), 'utf-8');

const doneStoryMd = '<!-- metadata\nid: 001\ntitle: Done Story\nstatus: done\ntype: story\n-->';
const doneFixMd = '<!-- metadata\nid: 001\ntitle: Done Fix\ntype: fix\nstatus: done\n-->';

function seedFs(content: string, fileName: string = 'STORY-001.md'): InMemoryFileSystem {
  const fs = new InMemoryFileSystem();
  fs.writeFile(`C:/workspace/.speckit/${fileName}`, content);
  return fs;
}

describe('handleStatusCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    workspace.getWorkspaceRoot = () => undefined;

    await handleStatusCommand(
      createMockRequest(''),
      stream,
      createMockToken(),
      new InMemoryFileSystem(),
      workspace,
    );

    expect(stream.getAllMarkdown()).toContain('workspace');
  });

  it('shows story title in output', async () => {
    const stream = createMockStream();
    const fs = seedFs(completeStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Autenticação via OAuth2 com GitHub');
  });

  it('shows language in output', async () => {
    const stream = createMockStream();
    const fs = seedFs(completeStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('typescript');
  });

  it('shows framework in output', async () => {
    const stream = createMockStream();
    const fs = seedFs(completeStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('react');
  });

  it('shows architecture in output', async () => {
    const stream = createMockStream();
    const fs = seedFs(completeStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('hexagonal');
  });

  it('shows Stories and Fixes sections', async () => {
    const stream = createMockStream();
    const fs = seedFs(completeStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Stories abertas');
    expect(stream.getAllMarkdown()).toContain('Fixes abertos');
  });

  it('shows nenhum when no fixes exist', async () => {
    const stream = createMockStream();
    const fs = seedFs(completeStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('nenhum');
  });

  // ── Story branches ────────────────────────────────────────────────────────

  it('skips story with status done', async () => {
    const stream = createMockStream();
    const fs = seedFs(doneStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).not.toContain('Done Story');
    expect(output).toContain('Stories abertas (0)');
    expect(output).toContain('nenhuma');
  });

  it('shows ✅ icon for a valid story', async () => {
    const stream = createMockStream();
    const fs = seedFs(completeStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('✅');
  });

  it('shows ⚠️ icon and gap count for an invalid story', async () => {
    const stream = createMockStream();
    const fs = seedFs(partialStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('⚠️');
    expect(output).toContain('lacuna(s)');
  });

  it('shows "erro ao ler arquivo" when readFile throws for a story', async () => {
    const stream = createMockStream();
    const fs = createMockFs();
    (fs.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disk error'));
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('erro ao ler arquivo');
  });

  it('shows "nenhuma" when story list is empty', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [], fixFiles: [] });

    await handleStatusCommand(
      createMockRequest(''),
      stream,
      createMockToken(),
      new InMemoryFileSystem(),
      workspace,
    );

    expect(stream.getAllMarkdown()).toContain('nenhuma');
  });

  // ── Fix branches ──────────────────────────────────────────────────────────

  it('skips fix with status done', async () => {
    const stream = createMockStream();
    const fs = seedFs(doneFixMd, 'FIX-001.md');
    const workspace = new WorkspaceStub({ storyFiles: [], fixFiles: ['FIX-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).not.toContain('Done Fix');
    expect(output).toContain('Fixes abertos (0)');
    expect(output).toContain('nenhum');
  });

  it('shows severity tag when fix has a severity', async () => {
    const stream = createMockStream();
    const fs = seedFs(completeFixMd, 'FIX-001.md');
    const workspace = new WorkspaceStub({ storyFiles: [], fixFiles: ['FIX-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('[high]');
  });

  it('omits severity tag when fix has no severity', async () => {
    const stream = createMockStream();
    const fs = seedFs(fixEmptyMd, 'FIX-001.md');
    const workspace = new WorkspaceStub({ storyFiles: [], fixFiles: ['FIX-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('🐛');
    expect(output).not.toMatch(/\[(critical|high|medium|low)\]/);
  });

  it('shows "erro ao ler arquivo" when readFile throws for a fix', async () => {
    const stream = createMockStream();
    const fs = createMockFs();
    (fs.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disk error'));
    const workspace = new WorkspaceStub({ storyFiles: [], fixFiles: ['FIX-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('erro ao ler arquivo');
  });

  // ── Gate labels ───────────────────────────────────────────────────────────

  it('shows gate label for a story at gate 0', async () => {
    const stream = createMockStream();
    const fs = seedFs(completeStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('🚪 Gate 0 — Alinhamento');
  });

  it('shows gate label for a story at gate 2', async () => {
    const stream = createMockStream();
    const storyAtGate2 = completeStoryMd.replace('version: 1', 'version: 1\ngate: 2');
    const fs = seedFs(storyAtGate2);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('🚪 Gate 2 — Testes');
  });

  it('shows status label for a story', async () => {
    const stream = createMockStream();
    const storyInProgress = completeStoryMd.replace(
      'version: 1',
      'version: 1\nstatus: in-progress',
    );
    const fs = seedFs(storyInProgress);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('[in-progress]');
  });

  it('shows gate label for a fix', async () => {
    const stream = createMockStream();
    const fs = seedFs(completeFixMd, 'FIX-001.md');
    const workspace = new WorkspaceStub({ storyFiles: [], fixFiles: ['FIX-001.md'] });

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('🚪 Gate 0 — Alinhamento');
  });

  // ── Audit & Trace coverage ────────────────────────────────────────────
  it('writes session log entry with story and fix counts', async () => {
    const fs = seedFs(completeStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });
    const stream = createMockStream();

    await handleStatusCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const sessionContent = fs.contentFor('session-');
    expect(sessionContent).toBeDefined();
    expect(sessionContent).toContain('/status');
    expect(sessionContent).toContain('1 stories');
    expect(sessionContent).toContain('0 fixes');
  });
});
