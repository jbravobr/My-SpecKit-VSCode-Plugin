import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleBatchCommand } from '../../../src/participant/commands/batchCommand';
import {
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

const doneStoryMd =
  '<!-- metadata\nid: DONE-001\ntitle: Done Story\nstatus: done\ntype: story\ngate: 4\n-->';

function seedFs(specs: Array<{ fileName: string; content: string }>): InMemoryFileSystem {
  const fs = new InMemoryFileSystem();
  for (const { fileName, content } of specs) {
    fs.writeFile(`C:/workspace/.speckit/${fileName}`, content);
  }
  return fs;
}

describe('handleBatchCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    workspace.getWorkspaceRoot = () => undefined;

    await handleBatchCommand(
      createMockRequest(''),
      stream,
      createMockToken(),
      new InMemoryFileSystem(),
      workspace,
    );

    expect(stream.getAllMarkdown()).toContain('workspace');
  });

  it('shows error when no specs found', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [], fixFiles: [] });

    await handleBatchCommand(
      createMockRequest(''),
      stream,
      createMockToken(),
      new InMemoryFileSystem(),
      workspace,
    );

    expect(stream.getAllMarkdown()).toContain('Nenhuma spec encontrada');
  });

  it('shows guidance for invalid flags', async () => {
    const fs = seedFs([{ fileName: 'STORY-001.md', content: completeStoryMd }]);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });
    const stream = createMockStream();

    await handleBatchCommand(createMockRequest('--full'), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Parâmetro(s) inválido(s)');
    expect(output).toContain('--generate');
    expect(output).toContain('--unified');
    expect(output).toContain('--story <id>');
  });

  it('validates all specs in parallel and shows summary', async () => {
    const fs = seedFs([
      { fileName: 'STORY-001.md', content: completeStoryMd },
      { fileName: 'STORY-002.md', content: partialStoryMd },
    ]);
    const workspace = new WorkspaceStub({
      storyFiles: ['STORY-001.md', 'STORY-002.md'],
      fixFiles: [],
    });
    const stream = createMockStream();

    await handleBatchCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('2');
    expect(output).toContain('STORY-001.md');
    expect(output).toContain('STORY-002.md');
    expect(output).toContain('Válida');
  });

  it('skips done stories', async () => {
    const fs = seedFs([
      { fileName: 'STORY-001.md', content: completeStoryMd },
      { fileName: 'STORY-DONE.md', content: doneStoryMd },
    ]);
    const workspace = new WorkspaceStub({
      storyFiles: ['STORY-001.md', 'STORY-DONE.md'],
      fixFiles: [],
    });
    const stream = createMockStream();

    await handleBatchCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('done');
  });

  it('handles mixed stories and fixes', async () => {
    const fs = seedFs([
      { fileName: 'STORY-001.md', content: completeStoryMd },
      { fileName: 'FIX-001.md', content: completeFixMd },
    ]);
    const workspace = new WorkspaceStub({
      storyFiles: ['STORY-001.md'],
      fixFiles: ['FIX-001.md'],
    });
    const stream = createMockStream();

    await handleBatchCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('STORY-001.md');
    expect(output).toContain('FIX-001.md');
  });

  it('shows hint for --generate flag when not provided', async () => {
    const fs = seedFs([{ fileName: 'STORY-001.md', content: completeStoryMd }]);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });
    const stream = createMockStream();

    await handleBatchCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('--generate --unified');
    expect(stream.button).toHaveBeenCalledWith({
      title: '🤖 Gerar Lote Unificado',
      command: 'speckit.openChatWithQuery',
      arguments: ['@speckit /batch --generate --unified'],
    });
    expect(stream.button).toHaveBeenCalledWith({
      title: '📋 Validar Spec Ativa',
      command: 'speckit.openChatWithQuery',
      arguments: ['@speckit /validate'],
    });
  });

  it('generates config when --generate flag provided', async () => {
    const fs = seedFs([{ fileName: 'STORY-001.md', content: completeStoryMd }]);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });
    const stream = createMockStream();

    await handleBatchCommand(
      createMockRequest('--generate'),
      stream,
      createMockToken(),
      fs,
      workspace,
    );

    const output = stream.getAllMarkdown();
    expect(output).toContain('arquivo(s) gerado(s)');
    expect(fs.hasFile('.github/copilot-instructions.md')).toBe(true);
  });

  it('reports invalid specs without generating config', async () => {
    const fs = seedFs([{ fileName: 'STORY-001.md', content: partialStoryMd }]);
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });
    const stream = createMockStream();

    await handleBatchCommand(
      createMockRequest('--generate'),
      stream,
      createMockToken(),
      fs,
      workspace,
    );

    const output = stream.getAllMarkdown();
    expect(output).toContain('Nenhuma spec válida');
  });

  it('handles file read errors gracefully', async () => {
    const fs = new InMemoryFileSystem();
    // Don't seed any file content — readFile will return empty string causing parse error
    const workspace = new WorkspaceStub({ storyFiles: ['STORY-MISSING.md'], fixFiles: [] });
    const stream = createMockStream();

    await handleBatchCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('1');
  });

  it('processes multiple valid specs with --generate', async () => {
    const fs = seedFs([
      { fileName: 'STORY-001.md', content: completeStoryMd },
      { fileName: 'STORY-002.md', content: completeStoryMd },
    ]);
    const workspace = new WorkspaceStub({
      storyFiles: ['STORY-001.md', 'STORY-002.md'],
      fixFiles: [],
    });
    const stream = createMockStream();

    await handleBatchCommand(
      createMockRequest('--generate'),
      stream,
      createMockToken(),
      fs,
      workspace,
    );

    const output = stream.getAllMarkdown();
    expect(output).toContain('2 spec(s) processada(s)');

    const sessionContent = fs.contentFor('session-');
    expect(sessionContent).toBeDefined();
    expect(sessionContent).toContain('SessionAlias:');
    expect(sessionContent).toContain('BatchId:');
    expect(sessionContent).toContain('LLMResponseReceived: true');
    expect(sessionContent).not.toContain('LLMResponseReceived: false');
  });

  describe('--unified flag', () => {
    it('requires value when --story is provided without id', async () => {
      const fs = seedFs([{ fileName: 'STORY-001.md', content: completeStoryMd }]);
      const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });
      const stream = createMockStream();

      await handleBatchCommand(
        createMockRequest('--generate --unified --story'),
        stream,
        createMockToken(),
        fs,
        workspace,
      );

      expect(stream.getAllMarkdown()).toContain('Use `--story <id>`');
    });

    it('allows --story only with --generate --unified', async () => {
      const fs = seedFs([{ fileName: 'STORY-001.md', content: completeStoryMd }]);
      const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });
      const stream = createMockStream();

      await handleBatchCommand(
        createMockRequest('--story 001'),
        stream,
        createMockToken(),
        fs,
        workspace,
      );

      expect(stream.getAllMarkdown()).toContain('só pode ser usada com `--generate --unified`');
    });

    it('shows hint for --unified when only --generate is used', async () => {
      const fs = seedFs([{ fileName: 'STORY-001.md', content: completeStoryMd }]);
      const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });
      const stream = createMockStream();

      await handleBatchCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

      expect(stream.getAllMarkdown()).toContain('--unified');
    });

    it('generates unified agents with --generate --unified', async () => {
      const fs = seedFs([{ fileName: 'STORY-001.md', content: completeStoryMd }]);
      const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });
      const stream = createMockStream();

      await handleBatchCommand(
        createMockRequest('--generate --unified'),
        stream,
        createMockToken(),
        fs,
        workspace,
      );

      const output = stream.getAllMarkdown();
      expect(output).toContain('Agente unificado');
      expect(output).toContain('Não espere um agente `speckit-revisor` separado neste fluxo.');
      expect(output).toContain('Estratégia de branch (modo unificado)');
      expect(output).toContain('use uma branch única do lote');
      expect(output).toContain('gate: 3');
      expect(output).toContain('status: review');
      expect(stream.button).toHaveBeenCalledWith({
        title: '✅ Iniciar Consentimento Batch',
        command: 'speckit.openChatWithQuery',
        arguments: ['@speckit /review-auto --batch-consent'],
      });
      expect(fs.hasFile('speckit-story-001.agent.md')).toBe(true);
      expect(fs.hasFile('copilot-instructions.md')).toBe(true);

      const sessionContent = fs.contentFor('session-');
      expect(sessionContent).toContain('LLMResponseReceived: true');
      expect(sessionContent).not.toContain('LLMResponseReceived: false');
    });

    it('generates unified agent for only the selected story id', async () => {
      const story002Md = completeStoryMd
        .replace('id: 001', 'id: 002')
        .replace('História 001', 'História 002');
      const fs = seedFs([
        { fileName: 'STORY-001.md', content: completeStoryMd },
        { fileName: 'STORY-002.md', content: story002Md },
      ]);
      const workspace = new WorkspaceStub({
        storyFiles: ['STORY-001.md', 'STORY-002.md'],
        fixFiles: [],
      });
      const stream = createMockStream();

      await handleBatchCommand(
        createMockRequest('--generate --unified --story 002'),
        stream,
        createMockToken(),
        fs,
        workspace,
      );

      const output = stream.getAllMarkdown();
      expect(output).toContain('Filtro aplicado');
      expect(output).toContain('`002`');
      expect(fs.hasFile('speckit-story-002.agent.md')).toBe(true);
      expect(fs.hasFile('speckit-story-001.agent.md')).toBe(false);

      const traceRaw = fs.contentFor('traceability/002.json');
      expect(traceRaw).toBeDefined();
      expect(traceRaw as string).toContain('/batch --generate --unified --story 002');
    });

    it('records validation and unified generation events in traceability with effective command', async () => {
      const fs = seedFs([{ fileName: 'STORY-001.md', content: completeStoryMd }]);
      const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });
      const stream = createMockStream();

      await handleBatchCommand(
        createMockRequest('--generate --unified'),
        stream,
        createMockToken(),
        fs,
        workspace,
      );

      const traceRaw = fs.contentFor('traceability/001.json');
      expect(traceRaw).toBeDefined();

      const trace = JSON.parse(traceRaw as string) as {
        entries: Array<{ description: string; data: { command: string } }>;
      };

      expect(
        trace.entries.some(
          (entry) =>
            entry.description.includes('batch validation') &&
            entry.data.command === '/batch --generate --unified',
        ),
      ).toBe(true);

      expect(
        trace.entries.some(
          (entry) =>
            entry.description.includes('agente unificado gerado') &&
            entry.data.command === '/batch --generate --unified',
        ),
      ).toBe(true);
    });

    it('reports independent and blocked stories in unified mode', async () => {
      const storyWithDep = completeStoryMd.replace('version: 1', 'version: 1\ndepends-on: 999');
      const fs = seedFs([
        { fileName: 'STORY-001.md', content: completeStoryMd },
        { fileName: 'STORY-002.md', content: storyWithDep },
      ]);
      const workspace = new WorkspaceStub({
        storyFiles: ['STORY-001.md', 'STORY-002.md'],
        fixFiles: [],
      });
      const stream = createMockStream();

      await handleBatchCommand(
        createMockRequest('--generate --unified'),
        stream,
        createMockToken(),
        fs,
        workspace,
      );

      const output = stream.getAllMarkdown();
      expect(output).toContain('independente');
      expect(output).toContain('bloqueada');
    });

    it('generates copilot-instructions.md in batch mode', async () => {
      const fs = seedFs([{ fileName: 'STORY-001.md', content: completeStoryMd }]);
      const workspace = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: [] });
      const stream = createMockStream();

      await handleBatchCommand(
        createMockRequest('--generate --unified'),
        stream,
        createMockToken(),
        fs,
        workspace,
      );

      const instructions = fs.contentFor('copilot-instructions.md');
      expect(instructions).toContain('Batch Mode');
      expect(instructions).toContain('speckit-story-001');
    });
  });
});
