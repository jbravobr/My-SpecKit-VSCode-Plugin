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

  it('transitions gate 2 to gate 3, persists metadata and emits non-blocking verdict', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();
    const git = fakeGit({
      changedFiles: async () => ['src/app/service.ts', 'src/app/controller.ts'],
    });

    await fs.writeFile('C:/workspace/.speckit/STORY-001.md', storyWithMeta(2, 'in-progress'));
    await fs.writeFile('C:/workspace/coverage/lcov.info', 'LF:100\nLH:90\n');

    await handleReviewAutoCommand(createMockRequest(''), stream, token, ws, fs, git);

    const output = stream.getAllMarkdown();
    const storyContent = await fs.readFile('C:/workspace/.speckit/STORY-001.md');

    expect(output).toContain('Transição de Gate/Status');
    expect(output).toContain('| Gate | `2` | `3` |');
    expect(output).toContain('| Status | `in-progress` | `review` |');
    expect(output).toContain('Arquivos detectados para revisão: 2');
    expect(output).toContain('Cobertura detectada: 90.00%');
    expect(output).toContain(
      'Veredito orquestrado:** REVISÃO GATE 3 EXECUTADA (sem bloqueios automáticos)',
    );
    expect(storyContent).toContain('gate: 3');
    expect(storyContent).toContain('status: review');
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

  it('applies approved transition from gate 3 to gate 4', async () => {
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

    const output = stream.getAllMarkdown();
    const storyContent = await fs.readFile('C:/workspace/.speckit/STORY-001.md');

    expect(output).toContain('Encerramento Orquestrado');
    expect(output).toContain('| Gate | `3` | `4` |');
    expect(output).toContain('| Status | `review` | `done` |');
    expect(storyContent).toContain('gate: 4');
    expect(storyContent).toContain('status: done');
  });

  it('applies changes-requested transition from gate 3 to gate 2', async () => {
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

    const output = stream.getAllMarkdown();
    const storyContent = await fs.readFile('C:/workspace/.speckit/STORY-001.md');

    expect(output).toContain('Retorno Orquestrado para Retrabalho');
    expect(output).toContain('| Gate | `3` | `2` |');
    expect(output).toContain('| Status | `review` | `in-progress` |');
    expect(storyContent).toContain('gate: 2');
    expect(storyContent).toContain('status: in-progress');
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
  });
});
