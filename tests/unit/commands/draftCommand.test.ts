import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDraftCommand, detectDraftIntent } from '../../../src/participant/commands/draftCommand';
import { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import { IWorkspace } from '../../../src/generator/utils/IWorkspace';

function createMockStream() {
  const calls: string[] = [];
  return {
    markdown: vi.fn((t: string) => { calls.push(t); }),
    getCalls: () => calls,
    getAllMarkdown: () => calls.join(''),
  };
}

function createMockFs(): IFileSystem {
  return {
    ensureDir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    fileExists: vi.fn().mockResolvedValue(false),
  };
}

function createMockWorkspace(overrides: Partial<IWorkspace> = {}): IWorkspace {
  return {
    getWorkspaceRoot: vi.fn().mockReturnValue('C:\\workspace'),
    listStoryFiles: vi.fn().mockResolvedValue([]),
    listFixFiles: vi.fn().mockResolvedValue([]),
    getActiveStoryPath: vi.fn().mockResolvedValue(undefined),
    getActiveSpecPath: vi.fn().mockResolvedValue(undefined),
    detectTechStack: vi.fn().mockResolvedValue({ language: 'typescript', framework: 'react', target: 'frontend', confidence: 'high', source: 'package.json' }),
    ...overrides,
  };
}

function createMockRequest(prompt: string): any {
  return { prompt };
}

describe('detectDraftIntent', () => {
  it('returns fix when --fix flag is present', () => {
    expect(detectDraftIntent('Login quebrado --fix')).toBe('fix');
  });

  it('returns fix when --bug flag is present', () => {
    expect(detectDraftIntent('Problema de login --bug')).toBe('fix');
  });

  it('returns fix when bug keywords detected (erro)', () => {
    expect(detectDraftIntent('O sistema retorna erro 500 ao fazer login')).toBe('fix');
  });

  it('returns fix when bug keywords detected (falha)', () => {
    expect(detectDraftIntent('Falha no processamento do pagamento')).toBe('fix');
  });

  it('returns fix when bug keywords detected (crash)', () => {
    expect(detectDraftIntent('A aplicação sofre crash ao abrir o modal')).toBe('fix');
  });

  it('returns fix when bug keywords detected (não funciona)', () => {
    expect(detectDraftIntent('O botão de exportar não funciona')).toBe('fix');
  });

  it('returns story for feature descriptions', () => {
    expect(detectDraftIntent('Quero calcular comissão de vendedores baseado em eventos Kafka')).toBe('story');
  });

  it('returns story by default when no keywords match', () => {
    expect(detectDraftIntent('Adicionar dashboard de métricas em tempo real')).toBe('story');
  });

  it('returns fix when keyword "bug" is detected', () => {
    expect(detectDraftIntent('Tem um bug na tela de login')).toBe('fix');
  });

  it('returns fix when keyword "error" (English) is detected', () => {
    expect(detectDraftIntent('Getting an error on submit')).toBe('fix');
  });

  it('returns fix when keyword "falhou" is detected', () => {
    expect(detectDraftIntent('O pagamento falhou durante o checkout')).toBe('fix');
  });

  it('returns fix when keyword "quebrado" (quebrad stem) is detected', () => {
    expect(detectDraftIntent('O link está quebrado após o deploy')).toBe('fix');
  });

  it('returns fix when keyword "broke" is detected', () => {
    expect(detectDraftIntent('The recent commit broke the auth flow')).toBe('fix');
  });

  it('returns fix when keyword "broken" is detected', () => {
    expect(detectDraftIntent('Pagination is broken on mobile')).toBe('fix');
  });

  it('returns fix when keyword "regression" is detected', () => {
    expect(detectDraftIntent('This looks like a regression in the payment module')).toBe('fix');
  });

  it('returns fix when keyword "regressão" (Portuguese) is detected', () => {
    expect(detectDraftIntent('Parece uma regressão no módulo de auth')).toBe('fix');
  });

  it('returns fix when keyword "corrigir" is detected', () => {
    expect(detectDraftIntent('Preciso corrigir o comportamento do scroll')).toBe('fix');
  });

  it('returns fix when keyword "correção" (cedilla) is detected', () => {
    expect(detectDraftIntent('Necessária correção no módulo de relatórios')).toBe('fix');
  });
});

describe('handleDraftCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace is open', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ getWorkspaceRoot: vi.fn().mockReturnValue(undefined) });
    const fs = createMockFs();

    await handleDraftCommand(createMockRequest('Alguma ideia'), stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('shows error with usage example when prompt is empty', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    const fs = createMockFs();

    await handleDraftCommand(createMockRequest(''), stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Forneça uma descrição');
    expect(stream.getAllMarkdown()).toContain('/draft');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('shows error when prompt is only whitespace', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    const fs = createMockFs();

    await handleDraftCommand(createMockRequest('   '), stream as any, {} as any, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Forneça uma descrição');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('creates elicit-story.prompt.md for story intent', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ listStoryFiles: vi.fn().mockResolvedValue([]) });
    const fs = createMockFs();

    await handleDraftCommand(
      createMockRequest('Quero calcular comissão baseado em eventos Kafka'),
      stream as any, {} as any, fs, workspace,
    );

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('elicit-story.prompt.md'),
      expect.any(String),
    );
    expect(stream.getAllMarkdown()).toContain('elicit-story.prompt.md');
    expect(stream.getAllMarkdown()).toContain('STORY-001');
  });

  it('written elicit-story content contains REGRA MESTRE (anti-loop guard)', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ listStoryFiles: vi.fn().mockResolvedValue([]) });
    const fs = createMockFs();

    await handleDraftCommand(
      createMockRequest('Quero calcular comissão baseado em eventos Kafka'),
      stream as any, {} as any, fs, workspace,
    );

    const [, writtenContent] = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(writtenContent).toContain('REGRA MESTRE');
    expect(writtenContent).toContain('Uma mensagem');
    expect(writtenContent).toContain('uma pergunta');
  });

  it('written elicit-story content does not contain auto-apply anti-pattern', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ listStoryFiles: vi.fn().mockResolvedValue([]) });
    const fs = createMockFs();

    await handleDraftCommand(
      createMockRequest('Quero calcular comissão baseado em eventos Kafka'),
      stream as any, {} as any, fs, workspace,
    );

    const [, writtenContent] = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(writtenContent).not.toContain('aplique os defaults abaixo informando que está fazendo isso');
    expect(writtenContent).not.toContain('Pergunte apenas se houver sinais de restrição específica');
  });

  it('written elicit-story content embeds the user rough input', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ listStoryFiles: vi.fn().mockResolvedValue([]) });
    const fs = createMockFs();
    const roughInput = 'Quero calcular comissão baseado em eventos Kafka';

    await handleDraftCommand(
      createMockRequest(roughInput),
      stream as any, {} as any, fs, workspace,
    );

    const [, writtenContent] = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(writtenContent).toContain(roughInput);
  });

  it('creates elicit-fix.prompt.md for fix intent (--fix flag)', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ listFixFiles: vi.fn().mockResolvedValue([]) });
    const fs = createMockFs();

    await handleDraftCommand(
      createMockRequest('Login retorna 500 --fix'),
      stream as any, {} as any, fs, workspace,
    );

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('elicit-fix.prompt.md'),
      expect.any(String),
    );
    expect(stream.getAllMarkdown()).toContain('elicit-fix.prompt.md');
    expect(stream.getAllMarkdown()).toContain('FIX-001');
  });

  it('written elicit-fix content contains REGRA MESTRE (anti-loop guard)', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ listFixFiles: vi.fn().mockResolvedValue([]) });
    const fs = createMockFs();

    await handleDraftCommand(
      createMockRequest('Login retorna 500 --fix'),
      stream as any, {} as any, fs, workspace,
    );

    const [, writtenContent] = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(writtenContent).toContain('REGRA MESTRE');
    expect(writtenContent).not.toContain('aplique os defaults abaixo informando que está fazendo isso');
  });

  it('creates elicit-fix.prompt.md for fix intent (keyword "erro")', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ listFixFiles: vi.fn().mockResolvedValue([]) });
    const fs = createMockFs();

    await handleDraftCommand(
      createMockRequest('O sistema retorna erro 500 após login'),
      stream as any, {} as any, fs, workspace,
    );

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('elicit-fix.prompt.md'),
      expect.any(String),
    );
  });

  it('increments story ID based on existing story files', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({
      listStoryFiles: vi.fn().mockResolvedValue(['STORY-001.md', 'STORY-002.md']),
    });
    const fs = createMockFs();

    await handleDraftCommand(
      createMockRequest('Nova feature de relatórios'),
      stream as any, {} as any, fs, workspace,
    );

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('elicit-story.prompt.md'),
      expect.stringContaining('STORY-003'),
    );
    expect(stream.getAllMarkdown()).toContain('STORY-003');
  });

  it('increments fix ID based on existing fix files', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({
      listFixFiles: vi.fn().mockResolvedValue(['FIX-001.md']),
    });
    const fs = createMockFs();

    await handleDraftCommand(
      createMockRequest('Crash ao exportar relatório --fix'),
      stream as any, {} as any, fs, workspace,
    );

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('elicit-fix.prompt.md'),
      expect.stringContaining('FIX-002'),
    );
  });

  it('calls ensureDir for the .speckit directory', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    const fs = createMockFs();

    await handleDraftCommand(
      createMockRequest('Implementar autenticação OAuth2'),
      stream as any, {} as any, fs, workspace,
    );

    expect(fs.ensureDir).toHaveBeenCalledWith(expect.stringContaining('.speckit'));
  });

  it('includes instruction to open with Copilot Chat in stream message', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    const fs = createMockFs();

    await handleDraftCommand(
      createMockRequest('Implementar cálculo de frete'),
      stream as any, {} as any, fs, workspace,
    );

    expect(stream.getAllMarkdown()).toContain('Copilot');
    expect(stream.getAllMarkdown()).toContain('/validate');
  });
});
