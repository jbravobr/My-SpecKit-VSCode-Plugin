import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectDraftIntent,
  handleDraftCommand,
} from '../../../src/participant/commands/draftCommand';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

const token = createMockToken();

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
    expect(
      detectDraftIntent('Quero calcular comissão de vendedores baseado em eventos Kafka'),
    ).toBe('story');
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

  it('returns refactoring when --refactoring flag is present', () => {
    expect(detectDraftIntent('Migrar serviço de pagamento para hexagonal --refactoring')).toBe(
      'refactoring',
    );
  });

  it('returns refactoring when --refactor flag is present', () => {
    expect(detectDraftIntent('Separar camadas do módulo de auth --refactor')).toBe('refactoring');
  });

  it('returns spike when --spike flag is present', () => {
    expect(detectDraftIntent('Avaliar viabilidade de SSR com Next.js --spike')).toBe('spike');
  });

  it('returns spike when --poc flag is present', () => {
    expect(detectDraftIntent('Testar integração com Stripe API --poc')).toBe('spike');
  });

  it('--fix flag takes priority over keyword detection', () => {
    expect(detectDraftIntent('Migrar módulo com erro --fix')).toBe('fix');
  });

  it('does not false-positive on substrings containing fix keywords', () => {
    expect(detectDraftIntent('Implementar alquebramento de cache')).toBe('story');
  });
});

describe('handleDraftCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace is open', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    workspace.getWorkspaceRoot = () => undefined;
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(createMockRequest('Alguma ideia'), stream, token, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
    expect(fs.writtenPaths().length).toBe(0);
  });

  it('shows error with usage example when prompt is empty', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub();
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(createMockRequest(''), stream, token, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Forneça uma descrição');
    expect(stream.getAllMarkdown()).toContain('/draft');
    expect(fs.writtenPaths().length).toBe(0);
  });

  it('shows error when prompt is only whitespace', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub();
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(createMockRequest('   '), stream, token, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Forneça uma descrição');
    expect(fs.writtenPaths().length).toBe(0);
  });

  it('creates elicit-story prompt for story intent', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Quero calcular comissão baseado em eventos Kafka'),
      stream,
      token,
      fs,
      workspace,
    );

    expect(fs.hasFile('elicit-story-US-')).toBe(true);
    const path = fs.writtenPaths().find((p) => p.includes('elicit-story'));
    expect(path).toMatch(/elicit-story-US-WORKSPACE-\d{8}-\d{4}\.prompt\.md$/);
    expect(stream.getAllMarkdown()).toMatch(/elicit-story-US-WORKSPACE-\d{8}-\d{4}\.prompt\.md/);
  });

  it('written elicit-story content contains REGRA MESTRE (anti-loop guard)', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Quero calcular comissão baseado em eventos Kafka'),
      stream,
      token,
      fs,
      workspace,
    );

    const content = fs.contentFor('elicit-story')!;
    expect(content).toContain('REGRA MESTRE');
    expect(content).toContain('Uma mensagem');
    expect(content).toContain('uma pergunta');
  });

  it('written elicit-story content does not contain auto-apply anti-pattern', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Quero calcular comissão baseado em eventos Kafka'),
      stream,
      token,
      fs,
      workspace,
    );

    const content = fs.contentFor('elicit-story')!;
    expect(content).not.toContain('aplique os defaults abaixo informando que está fazendo isso');
    expect(content).not.toContain('Pergunte apenas se houver sinais de restrição específica');
  });

  it('written elicit-story content embeds the user rough input', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const fs = new InMemoryFileSystem();
    const roughInput = 'Quero calcular comissão baseado em eventos Kafka';

    await handleDraftCommand(createMockRequest(roughInput), stream, token, fs, workspace);

    const content = fs.contentFor('elicit-story')!;
    expect(content).toContain(roughInput);
  });

  it('creates elicit-fix prompt for fix intent (--fix flag)', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ fixFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Login retorna 500 --fix'),
      stream,
      token,
      fs,
      workspace,
    );

    expect(fs.hasFile('elicit-fix-FIX-')).toBe(true);
    const path = fs.writtenPaths().find((p) => p.includes('elicit-fix'));
    expect(path).toMatch(/elicit-fix-FIX-WORKSPACE-\d{8}-\d{4}\.prompt\.md$/);
    expect(stream.getAllMarkdown()).toMatch(/elicit-fix-FIX-WORKSPACE-\d{8}-\d{4}\.prompt\.md/);
  });

  it('written elicit-fix content contains REGRA MESTRE (anti-loop guard)', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ fixFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Login retorna 500 --fix'),
      stream,
      token,
      fs,
      workspace,
    );

    const content = fs.contentFor('elicit-fix')!;
    expect(content).toContain('REGRA MESTRE');
    expect(content).not.toContain('aplique os defaults abaixo informando que está fazendo isso');
  });

  it('creates elicit-fix prompt for fix intent (keyword "erro")', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ fixFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('O sistema retorna erro 500 após login'),
      stream,
      token,
      fs,
      workspace,
    );

    expect(fs.hasFile('elicit-fix-FIX-')).toBe(true);
  });

  it('generates unique story ID for draft avoiding collisions', async () => {
    const stream = createMockStream();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const existingId = `US-WORKSPACE-${yyyy}${mm}${dd}-${hh}${min}.md`;
    const workspace = new WorkspaceStub({ storyFiles: [existingId] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Nova feature de relatórios'),
      stream,
      token,
      fs,
      workspace,
    );

    const writtenPath = fs.writtenPaths().find((p) => p.includes('elicit-story'))!;
    expect(writtenPath).toMatch(/elicit-story-US-WORKSPACE-\d{8}-\d{4}\.prompt\.md$/);
    expect(writtenPath).not.toContain(existingId.replace('.md', ''));
  });

  it('generates unique fix ID avoiding collisions', async () => {
    const stream = createMockStream();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const existingId = `FIX-WORKSPACE-${yyyy}${mm}${dd}-${hh}${min}.md`;
    const workspace = new WorkspaceStub({ fixFiles: [existingId] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Crash ao exportar relatório --fix'),
      stream,
      token,
      fs,
      workspace,
    );

    const writtenPath = fs.writtenPaths().find((p) => p.includes('elicit-fix'))!;
    expect(writtenPath).toMatch(/elicit-fix-FIX-WORKSPACE-\d{8}-\d{4}\.prompt\.md$/);
  });

  it('second draft creates filename with same pattern', async () => {
    const stream1 = createMockStream();
    const stream2 = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const fs1 = new InMemoryFileSystem();
    const fs2 = new InMemoryFileSystem();

    await handleDraftCommand(createMockRequest('Feature A'), stream1, token, fs1, workspace);
    await handleDraftCommand(createMockRequest('Feature B'), stream2, token, fs2, workspace);

    const path1 = fs1.writtenPaths().find((p) => p.includes('elicit-story'))!;
    const path2 = fs2.writtenPaths().find((p) => p.includes('elicit-story'))!;
    expect(path1).toMatch(/elicit-story-US-WORKSPACE-\d{8}-\d{4}\.prompt\.md$/);
    expect(path2).toMatch(/elicit-story-US-WORKSPACE-\d{8}-\d{4}\.prompt\.md$/);
  });

  it('written elicit-story content contains "Pular" skip instruction', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Quero calcular comissão'),
      stream,
      token,
      fs,
      workspace,
    );

    const content = fs.contentFor('elicit-story')!;
    expect(content).toContain('Pular');
    expect(content).toContain('TODO: A ser preenchido');
  });

  it('written elicit-story content instructs to create file (not copy)', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Quero calcular comissão'),
      stream,
      token,
      fs,
      workspace,
    );

    const content = fs.contentFor('elicit-story')!;
    expect(content).toContain('Crie o arquivo');
    expect(content).toContain('criado com sucesso');
    expect(content).not.toContain('Copie o conteúdo acima');
  });

  it('written elicit-fix content contains "Pular" skip instruction', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ fixFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Crash ao exportar --fix'),
      stream,
      token,
      fs,
      workspace,
    );

    const content = fs.contentFor('elicit-fix')!;
    expect(content).toContain('Pular');
    expect(content).toContain('TODO: A ser preenchido');
  });

  it('written elicit-fix content instructs to create file (not copy)', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ fixFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Crash ao exportar --fix'),
      stream,
      token,
      fs,
      workspace,
    );

    const content = fs.contentFor('elicit-fix')!;
    expect(content).toContain('Crie o arquivo');
    expect(content).toContain('criado com sucesso');
    expect(content).not.toContain('Copie o conteúdo acima');
  });

  it('creates file inside .speckit directory', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub();
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Implementar autenticação OAuth2'),
      stream,
      token,
      fs,
      workspace,
    );

    const writtenPath = fs.writtenPaths().find((p) => p.includes('elicit'))!;
    expect(writtenPath).toContain('.speckit');
  });

  it('includes instruction to open with Copilot Chat in stream message', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub();
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Implementar cálculo de frete'),
      stream,
      token,
      fs,
      workspace,
    );

    expect(stream.getAllMarkdown()).toContain('Copilot');
    expect(stream.getAllMarkdown()).toContain('/validate');
  });

  it('creates elicit-story for --refactoring flag with type refactoring in template', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Migrar módulo de pagamento para hexagonal --refactoring'),
      stream,
      token,
      fs,
      workspace,
    );

    const content = fs.contentFor('elicit-story')!;
    expect(content).toContain('Refactoring');
    expect(content).toContain('type: refactoring');
    expect(content).not.toContain('--refactoring');
  });

  it('creates elicit-story for --spike flag with type spike in template', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Avaliar viabilidade de SSR com Next.js --spike'),
      stream,
      token,
      fs,
      workspace,
    );

    const content = fs.contentFor('elicit-story')!;
    expect(content).toContain('Spike');
    expect(content).toContain('type: spike');
    expect(content).not.toContain('--spike');
  });

  it('strips --fix flag from the roughInput in elicit content', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ fixFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('O login retorna 500 --fix'),
      stream,
      token,
      fs,
      workspace,
    );

    const content = fs.contentFor('elicit-fix')!;
    expect(content).not.toContain('--fix');
    expect(content).toContain('login retorna 500');
  });

  it('includes workspace defaults context when defaults file exists', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const fs = new InMemoryFileSystem();
    // Pre-seed defaults.yml
    await fs.writeFile(
      'C:/workspace/.speckit/defaults.yml',
      'language: java\nframework: springboot\n',
    );

    await handleDraftCommand(
      createMockRequest('Criar serviço de notificações'),
      stream,
      token,
      fs,
      workspace,
    );

    const content = fs.contentFor('elicit-story')!;
    expect(content).toContain('java');
    expect(content).toContain('springboot');
    expect(content).toContain('Defaults do workspace');
  });

  it('shows --refactoring and --spike in usage example when prompt is empty', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub();
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(createMockRequest(''), stream, token, fs, workspace);

    expect(stream.getAllMarkdown()).toContain('--refactoring');
    expect(stream.getAllMarkdown()).toContain('--spike');
  });

  // ── Audit & Trace coverage ────────────────────────────────────────────
  it('writes traceability entry for story draft', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Nova feature de dashboard'),
      stream,
      token,
      fs,
      workspace,
    );

    const traceContent = fs.contentFor('traceability/');
    expect(traceContent).toBeDefined();
    const trace = JSON.parse(traceContent!);
    expect(trace.specType).toBe('story');
    expect(trace.entries[0].description).toBe('elicit prompt created');
  });

  it('writes traceability entry for fix draft', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ fixFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Login retorna 500 --fix'),
      stream,
      token,
      fs,
      workspace,
    );

    const traceContent = fs.contentFor('traceability/');
    expect(traceContent).toBeDefined();
    const trace = JSON.parse(traceContent!);
    expect(trace.specType).toBe('fix');
    expect(trace.entries[0].description).toBe('elicit prompt created');
  });

  it('writes session alias metadata for draft execution', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleDraftCommand(
      createMockRequest('Criar relatório de auditoria mensal'),
      stream,
      token,
      fs,
      workspace,
    );

    const sessionContent = fs.contentFor('session-');
    expect(sessionContent).toBeDefined();
    expect(sessionContent).toContain('/draft');
    expect(sessionContent).toContain('SessionAlias:');
    expect(sessionContent).toContain('AgentMode: implementador');
    expect(sessionContent).toContain('Gate: 0');
  });
});
