import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { handleReviewAutoCommand } from '../../../src/participant/commands/reviewAutoCommand';
import { IGitOps } from '../../../src/workflow/GitOperations';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

const token = createMockToken();
const fixturesDir = resolve(__dirname, '../../fixtures');
const completeStoryMd = readFileSync(resolve(fixturesDir, 'story-complete.md'), 'utf-8');

function fakeGit(overrides: Partial<IGitOps> = {}): IGitOps {
  return {
    diff: async () => '',
    commit: async () => '',
    hasChanges: async () => false,
    isRepository: async () => true,
    init: async () => '',
    changedFiles: async () => [],
    ...overrides,
  };
}

function storyWithMeta(gate: number, status: string): string {
  const withStatus = /^\s*status:\s*.+$/m.test(completeStoryMd)
    ? completeStoryMd.replace(/^\s*status:\s*.+$/m, `status: ${status}`)
    : completeStoryMd.replace(/<!--\s*metadata\s*([\s\S]*?)-->/, (_m, block) => {
        return `<!-- metadata\n${block.trimEnd()}\nstatus: ${status}\n-->`;
      });

  return /^\s*gate:\s*\d+/m.test(withStatus)
    ? withStatus.replace(/^\s*gate:\s*\d+/m, `gate: ${gate}`)
    : withStatus.replace(/<!--\s*metadata\s*([\s\S]*?)-->/, (_m, block) => {
        return `<!-- metadata\n${block.trimEnd()}\ngate: ${gate}\n-->`;
      });
}

function extractIntentId(output: string): string {
  const match = output.match(/Intent-ID:\s*`([^`]+)`/);
  return match?.[1] ?? '';
}

describe('handleReviewAutoCommand', () => {
  it('shows error when no workspace is available', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    ws.getWorkspaceRoot = () => undefined;

    await handleReviewAutoCommand(
      createMockRequest(''),
      stream,
      token,
      ws,
      new InMemoryFileSystem(),
      fakeGit(),
    );

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
  });

  it('blocks review-auto when gate is below 2', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();
    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyWithMeta(1, 'in-progress'));

    await handleReviewAutoCommand(createMockRequest(''), stream, token, ws, fs, fakeGit());

    expect(stream.getAllMarkdown()).toContain('exige conclusão prévia dos Gates 0-2');
    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '📊 Ver Status das Specs',
      command: 'speckit.openChatWithQuery',
      arguments: ['@speckit /status'],
    });
  });

  it('rejects non-story specs', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/FIX-001.md' });
    await fs.writeFile(
      'C:/workspace/.speckit/FIX-001.md',
      '<!-- metadata\nid: FIX-001\ntype: fix\nstatus: review\ngate: 3\n-->',
    );

    await handleReviewAutoCommand(createMockRequest(''), stream, token, ws, fs, fakeGit());

    expect(stream.getAllMarkdown()).toContain('disponível apenas para Story');
  });

  it('proposes and confirms transition gate 2 to gate 3 before persisting metadata', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();
    const git = fakeGit({
      changedFiles: async () => ['src/app/service.ts', 'src/app/controller.ts'],
    });

    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyWithMeta(2, 'in-progress'));
    await fs.writeFile('C:/workspace/coverage/lcov.info', 'LF:100\nLH:90\n');

    await handleReviewAutoCommand(createMockRequest(''), stream, token, ws, fs, git);

    const proposalOutput = stream.getAllMarkdown();
    const intentId = extractIntentId(proposalOutput);
    expect(proposalOutput).toContain('Confirmação obrigatória de transição');
    expect(intentId).toBeTruthy();
    expect(stream.button).toHaveBeenCalledWith({
      title: '✅ Confirmar Transição Proposta',
      command: 'speckit.openChatWithQuery',
      arguments: [`@speckit /review-auto --confirm ${intentId}`],
    });

    const afterProposal = await fs.readFile('C:/workspace/.speckit/STORY-001.md');
    expect(afterProposal).toContain('gate: 2');
    expect(afterProposal).toContain('status: in-progress');

    await handleReviewAutoCommand(
      createMockRequest(`--confirm ${intentId}`),
      stream,
      token,
      ws,
      fs,
      git,
    );

    const output = stream.getAllMarkdown();
    const storyContent = await fs.readFile('C:/workspace/.speckit/STORY-001.md');
    const sessionContent = fs.contentFor('session-');
    const auditContent = fs.contentFor('audit.log');
    const traceRaw = fs.contentFor('traceability/001.json');

    expect(output).toContain('Confirmação obrigatória de transição');
    expect(output).toContain('Transição de Gate/Status');
    expect(output).toContain('| Gate | `2` | `3` |');
    expect(output).toContain('| Status | `in-progress` | `review` |');
    expect(output).toContain('Arquivos detectados para revisão: 2');
    expect(output).toContain('Cobertura detectada: 90.00%');
    expect(output).toContain(
      'Veredito orquestrado:** REVISÃO GATE 3 EXECUTADA (sem bloqueios automáticos)',
    );
    expect(stream.button).toHaveBeenCalledWith({
      title: '▶ Iniciar Gate 3 (revisão formal)',
      command: 'speckit.openChatWithQuery',
      arguments: ['@speckit /review-auto'],
    });
    expect(stream.button).toHaveBeenCalledWith({
      title: '🔄 Registrar ALTERAÇÕES SOLICITADAS',
      command: 'speckit.openChatWithQuery',
      arguments: ['@speckit /review-auto --changes-requested --auto'],
    });
    expect(stream.button).toHaveBeenCalledWith({
      title: '✅ Registrar APROVADO',
      command: 'speckit.openChatWithQuery',
      arguments: ['@speckit /review-auto --approved --auto'],
    });
    expect(storyContent).toContain('gate: 3');
    expect(storyContent).toContain('status: review');

    expect(sessionContent).toContain('/review-auto');
    expect(sessionContent).toContain('SessionAlias:');
    expect(sessionContent).toContain('LLMResponseReceived: true');

    expect(auditContent).toContain('/review-auto: ✅ REVISÃO GATE 3 EXECUTADA');

    expect(traceRaw).toBeDefined();
    const trace = JSON.parse(traceRaw as string) as {
      entries: Array<{ description: string; data: { command: string } }>;
    };
    expect(
      trace.entries.some(
        (entry) =>
          entry.description.includes('review-auto event') && entry.data.command === '/review-auto',
      ),
    ).toBe(true);
  });

  it('emits blocking verdict when coverage evidence is missing', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();
    const git = fakeGit({ changedFiles: async () => ['src/domain/rules.ts'] });

    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyWithMeta(3, 'review'));

    await handleReviewAutoCommand(createMockRequest(''), stream, token, ws, fs, git);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Evidência de cobertura não encontrada');
    expect(output).toContain(
      'Veredito orquestrado:** ALTERAÇÕES SOLICITADAS (bloqueios automáticos)',
    );
  });

  it('requires explicit confirmation before applying approved transition from gate 3 to gate 4', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyWithMeta(3, 'review'));

    await handleReviewAutoCommand(
      createMockRequest('--approved'),
      stream,
      token,
      ws,
      fs,
      fakeGit(),
    );

    const proposalOutput = stream.getAllMarkdown();
    const intentId = extractIntentId(proposalOutput);
    expect(proposalOutput).toContain('Confirmação obrigatória de transição');
    expect(intentId).toBeTruthy();
    expect(stream.button).toHaveBeenCalledWith({
      title: '✅ Confirmar Transição Proposta',
      command: 'speckit.openChatWithQuery',
      arguments: [`@speckit /review-auto --confirm ${intentId}`],
    });

    const contentAfterProposal = await fs.readFile('C:/workspace/.speckit/STORY-001.md');
    expect(contentAfterProposal).toContain('gate: 3');
    expect(contentAfterProposal).toContain('status: review');

    await handleReviewAutoCommand(
      createMockRequest(`--approved --confirm ${intentId}`),
      stream,
      token,
      ws,
      fs,
      fakeGit(),
    );

    const output = stream.getAllMarkdown();
    const storyContent = await fs.readFile('C:/workspace/.speckit/STORY-001.md');
    const auditContent = fs.contentFor('audit.log');
    const traceRaw = fs.contentFor('traceability/001.json');

    expect(output).toContain('Encerramento Orquestrado');
    expect(output).toContain('| Gate | `3` | `4` |');
    expect(output).toContain('| Status | `review` | `done` |');
    expect(output).toContain('Comandos disponíveis agora (contextuais)');
    expect(storyContent).toContain('gate: 4');
    expect(storyContent).toContain('status: done');
    expect(auditContent).toContain('/review-auto --approved: ✅ Veredito APROVADO');
    expect(stream.button).toHaveBeenCalledWith({
      title: '📦 Ver Status Completo (--all)',
      command: 'speckit.openChatWithQuery',
      arguments: ['@speckit /status --all'],
    });

    const trace = JSON.parse(traceRaw as string) as {
      entries: Array<{ description: string; data: { command: string } }>;
    };
    expect(trace.entries.some((entry) => entry.data.command === '/review-auto --approved')).toBe(
      true,
    );
  });

  it('requires explicit confirmation before applying changes-requested transition from gate 3 to gate 2', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyWithMeta(3, 'review'));

    await handleReviewAutoCommand(
      createMockRequest('--changes-requested'),
      stream,
      token,
      ws,
      fs,
      fakeGit(),
    );

    const proposalOutput = stream.getAllMarkdown();
    const intentId = extractIntentId(proposalOutput);
    expect(proposalOutput).toContain('Confirmação obrigatória de transição');
    expect(intentId).toBeTruthy();
    expect(stream.button).toHaveBeenCalledWith({
      title: '✅ Confirmar Transição Proposta',
      command: 'speckit.openChatWithQuery',
      arguments: [`@speckit /review-auto --confirm ${intentId}`],
    });

    const contentAfterProposal = await fs.readFile('C:/workspace/.speckit/STORY-001.md');
    expect(contentAfterProposal).toContain('gate: 3');
    expect(contentAfterProposal).toContain('status: review');

    await handleReviewAutoCommand(
      createMockRequest(`--changes-requested --confirm ${intentId}`),
      stream,
      token,
      ws,
      fs,
      fakeGit(),
    );

    const output = stream.getAllMarkdown();
    const storyContent = await fs.readFile('C:/workspace/.speckit/STORY-001.md');
    const auditContent = fs.contentFor('audit.log');
    const traceRaw = fs.contentFor('traceability/001.json');

    expect(output).toContain('Retorno Orquestrado para Retrabalho');
    expect(output).toContain('| Gate | `3` | `2` |');
    expect(output).toContain('| Status | `review` | `in-progress` |');
    expect(storyContent).toContain('gate: 2');
    expect(storyContent).toContain('status: in-progress');
    expect(auditContent).toContain('/review-auto --changes-requested: 🔄 Alterações solicitadas');

    const trace = JSON.parse(traceRaw as string) as {
      entries: Array<{ description: string; data: { command: string } }>;
    };
    expect(
      trace.entries.some((entry) => entry.data.command === '/review-auto --changes-requested'),
    ).toBe(true);
  });

  it('rejects conflicting review-auto flags', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();
    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyWithMeta(3, 'review'));

    await handleReviewAutoCommand(
      createMockRequest('--approved --changes-requested'),
      stream,
      token,
      ws,
      fs,
      fakeGit(),
    );

    expect(stream.getAllMarkdown()).toContain('Flags conflitantes');
    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis agora (contextuais)');
  });

  it('applies --approved --auto transition when activeSpecPath points to a story in review status (batch unified flow)', async () => {
    // Regression test: getActiveSpecPath used to filter only status=open, which meant
    // stories in status=review (gate 3) were never returned as "active", causing the
    // --approved transition to silently skip the metadata update.
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({
      activeSpecPath: 'C:/workspace/.speckit/STORY-001.md',
    });

    // Story is at gate 3 / status review — the state just before --approved
    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyWithMeta(3, 'review'));

    // Set up batch session consent required by --auto mode
    const futureExpiry = new Date(Date.now() + 60 * 60_000).toISOString();
    await fs.writeFile(
      'C:/workspace/.speckit/governance/transition-state.json',
      JSON.stringify({
        version: 1,
        intents: [],
        batchSessionConsent: {
          id: 'session-test-001',
          createdAt: new Date().toISOString(),
          expiresAt: futureExpiry,
          note: 'test consent',
        },
      }),
    );

    await handleReviewAutoCommand(
      createMockRequest('--approved --auto'),
      stream,
      token,
      ws,
      fs,
      fakeGit(),
    );

    const storyContent = await fs.readFile('C:/workspace/.speckit/STORY-001.md');
    const output = stream.getAllMarkdown();

    expect(output).toContain('Encerramento Orquestrado');
    expect(storyContent).toContain('gate: 4');
    expect(storyContent).toContain('status: done');
  });

  it('offers quick action to confirm batch consent intent', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();
    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyWithMeta(2, 'in-progress'));

    await handleReviewAutoCommand(
      createMockRequest('--batch-consent'),
      stream,
      token,
      ws,
      fs,
      fakeGit(),
    );

    const output = stream.getAllMarkdown();
    const intentId = extractIntentId(output);

    expect(output).toContain('Consentimento único obrigatório');
    expect(output).toContain('Comandos disponíveis agora (contextuais)');
    expect(intentId).toBeTruthy();
    expect(stream.button).toHaveBeenCalledWith({
      title: '✅ Confirmar Consentimento Batch',
      command: 'speckit.openChatWithQuery',
      arguments: [`@speckit /review-auto --batch-consent --confirm ${intentId}`],
    });
  });
});
