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

function extractIntentId(output: string): string {
  const match = output.match(/Intent-ID:\s*`([^`]+)`/);
  return match?.[1] ?? '';
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

  it('shows guidance for invalid flags', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });
    const fs = seedFs(completeStoryMd);

    await handleStatusCommand(
      createMockRequest('--everything'),
      stream,
      createMockToken(),
      fs,
      workspace,
    );

    const output = stream.getAllMarkdown();
    expect(output).toContain('Parâmetro(s) inválido(s)');
    expect(output).toContain('--all');
    expect(output).toContain('--closed');
    expect(output).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '📊 Executar /status',
      command: 'speckit.openChatWithQuery',
      arguments: ['@speckit /status'],
    });
  });

  it('shows guidance when --confirm is missing intent-id', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });
    const fs = seedFs(completeStoryMd);

    await handleStatusCommand(
      createMockRequest('--confirm'),
      stream,
      createMockToken(),
      fs,
      workspace,
    );

    const output = stream.getAllMarkdown();
    expect(output).toContain('Use `--confirm <intent-id>`');
    expect(output).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '🔁 Gerar Proposta de Retrofit',
      command: 'speckit.openChatWithQuery',
      arguments: ['@speckit /status --fix'],
    });
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
    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '📊 Atualizar Status',
      command: 'speckit.openChatWithQuery',
      arguments: ['@speckit /status'],
    });
    expect(stream.button).toHaveBeenCalledWith({
      title: '📦 Ver Status Completo (--all)',
      command: 'speckit.openChatWithQuery',
      arguments: ['@speckit /status --all'],
    });
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

  it('includes done stories when --all is used', async () => {
    const stream = createMockStream();
    const fs = seedFs(doneStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });

    await handleStatusCommand(createMockRequest('--all'), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Stories (1)');
    expect(output).toContain('Done Story');
    expect(output).toContain('[done]');
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

  it('includes done fixes when --all is used', async () => {
    const stream = createMockStream();
    const fs = seedFs(doneFixMd, 'FIX-001.md');
    const workspace = new WorkspaceStub({ storyFiles: [], fixFiles: ['FIX-001.md'] });

    await handleStatusCommand(createMockRequest('--all'), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Fixes (1)');
    expect(output).toContain('Done Fix');
    expect(output).toContain('[done]');
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

  // ── Bug regression: stories with status=done but stored gate < 4 ──────
  // Reproduces the issue where /status-all showed "Gate 0 — Alinhamento"
  // for stories already implemented, reviewed and committed (status=done)
  // because only /review-auto on the active spec persisted gate: 4.

  const doneStoryAtGate0Md =
    '<!-- metadata\nid: 042\ntitle: Old Done Story\ntype: story\nstatus: done\ngate: 0\n-->';

  it('displays Gate 4 — Entrega for status=done stories even when stored gate is 0', async () => {
    const stream = createMockStream();
    const fs = seedFs(doneStoryAtGate0Md);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });

    await handleStatusCommand(createMockRequest('--all'), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Old Done Story');
    expect(output).toContain('🚪 Gate 4 — Entrega');
    expect(output).not.toContain('🚪 Gate 0 — Alinhamento');
  });

  it('displays Gate 4 — Entrega for status=done fixes even when stored gate is 0', async () => {
    const doneFixAtGate0Md =
      '<!-- metadata\nid: 042\ntitle: Old Done Fix\ntype: fix\nstatus: done\ngate: 0\n-->';
    const stream = createMockStream();
    const fs = seedFs(doneFixAtGate0Md, 'FIX-001.md');
    const workspace = new WorkspaceStub({ storyFiles: [], fixFiles: ['FIX-001.md'] });

    await handleStatusCommand(createMockRequest('--all'), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Old Done Fix');
    expect(output).toContain('🚪 Gate 4 — Entrega');
  });

  it('keeps stored gate for cancelled stories (does not auto-promote)', async () => {
    const cancelledMd =
      '<!-- metadata\nid: 042\ntitle: Cancelled Story\ntype: story\nstatus: cancelled\ngate: 1\n-->';
    const stream = createMockStream();
    const fs = seedFs(cancelledMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });

    await handleStatusCommand(createMockRequest('--all'), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('🚪 Gate 1 — Implementação');
  });

  // ── --fix flag retro-persists gate on disk ───────────────────────────

  it('--fix proposes retrofit and only persists gate: 4 after explicit confirmation', async () => {
    const stream = createMockStream();
    const fs = seedFs(doneStoryAtGate0Md);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });

    await handleStatusCommand(createMockRequest('--fix'), stream, createMockToken(), fs, workspace);

    const proposalOutput = stream.getAllMarkdown();
    const intentId = extractIntentId(proposalOutput);
    expect(proposalOutput).toContain('Confirmação obrigatória para retrofit de gate');
    expect(intentId).toBeTruthy();
    expect(stream.button).toHaveBeenCalledWith({
      title: '✅ Confirmar Retrofit Proposto',
      command: 'speckit.openChatWithQuery',
      arguments: [`@speckit /status --fix --confirm ${intentId}`],
    });

    const unchanged = await fs.readFile('C:/workspace/.speckit/STORY-001.md');
    expect(unchanged).toMatch(/^gate:\s*0$/m);

    await handleStatusCommand(
      createMockRequest(`--fix --confirm ${intentId}`),
      stream,
      createMockToken(),
      fs,
      workspace,
    );

    const updated = await fs.readFile('C:/workspace/.speckit/STORY-001.md');
    expect(updated).toMatch(/^gate:\s*4$/m);
    expect(updated).not.toMatch(/^gate:\s*0$/m);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Retrofit de gate aplicado em 1 arquivo(s)');
    expect(output).toContain('STORY-001.md');
    // --fix implies --all
    expect(output).toContain('Stories (1)');
  });

  it('--fix with invalid intent suggests generating a new retrofit proposal', async () => {
    const stream = createMockStream();
    const fs = seedFs(doneStoryAtGate0Md);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });

    await handleStatusCommand(
      createMockRequest('--fix --confirm invalid-intent-id'),
      stream,
      createMockToken(),
      fs,
      workspace,
    );

    const output = stream.getAllMarkdown();
    expect(output).toContain('Intent-ID inválido ou expirado');
    expect(output).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '🔁 Gerar Nova Proposta de Retrofit',
      command: 'speckit.openChatWithQuery',
      arguments: ['@speckit /status --fix'],
    });
  });

  it('--fix reports nothing to do when there are no stale done specs', async () => {
    const stream = createMockStream();
    const fs = seedFs(completeStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });

    await handleStatusCommand(createMockRequest('--fix'), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('nenhuma spec `done` precisava de correção');
  });

  it('--fix does not modify cancelled specs', async () => {
    const cancelledMd =
      '<!-- metadata\nid: 042\ntitle: Cancelled\ntype: story\nstatus: cancelled\ngate: 1\n-->';
    const stream = createMockStream();
    const fs = seedFs(cancelledMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });

    await handleStatusCommand(createMockRequest('--fix'), stream, createMockToken(), fs, workspace);

    const updated = await fs.readFile('C:/workspace/.speckit/STORY-001.md');
    expect(updated).toMatch(/^gate:\s*1$/m);
  });

  it('--fix retro-persists gate: 4 for done fixes with stale gate only after confirm', async () => {
    const doneFixAtGate2Md =
      '<!-- metadata\nid: 042\ntitle: Old Done Fix\ntype: fix\nstatus: done\ngate: 2\n-->';
    const stream = createMockStream();
    const fs = seedFs(doneFixAtGate2Md, 'FIX-001.md');
    const workspace = new WorkspaceStub({ storyFiles: [], fixFiles: ['FIX-001.md'] });

    await handleStatusCommand(createMockRequest('--fix'), stream, createMockToken(), fs, workspace);

    const proposalOutput = stream.getAllMarkdown();
    const intentId = extractIntentId(proposalOutput);
    expect(intentId).toBeTruthy();

    await handleStatusCommand(
      createMockRequest(`--fix --confirm ${intentId}`),
      stream,
      createMockToken(),
      fs,
      workspace,
    );

    const updated = await fs.readFile('C:/workspace/.speckit/FIX-001.md');
    expect(updated).toMatch(/^gate:\s*4$/m);
  });

  it('rejects unknown flags (preserves --all/--closed/--fix allowlist)', async () => {
    const stream = createMockStream();
    const fs = seedFs(completeStoryMd);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });

    await handleStatusCommand(
      createMockRequest('--bogus'),
      stream,
      createMockToken(),
      fs,
      workspace,
    );

    const output = stream.getAllMarkdown();
    expect(output).toContain('Parâmetro(s) inválido(s)');
    expect(output).toContain('--fix');
  });
});
