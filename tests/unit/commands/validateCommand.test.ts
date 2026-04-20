import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleValidateCommand,
  warnIfSpecLarge,
} from '../../../src/participant/commands/validateCommand';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

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

    await handleValidateCommand(
      createMockRequest(''),
      stream,
      createMockToken(),
      new InMemoryFileSystem(),
      workspace,
    );

    expect(stream.getAllMarkdown()).toContain('workspace');
  });

  it('shows error when no open spec file is found', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ activeSpecPath: undefined as unknown as string });
    workspace.getActiveSpecPath = async () => undefined;

    await handleValidateCommand(
      createMockRequest(''),
      stream,
      createMockToken(),
      new InMemoryFileSystem(),
      workspace,
    );

    expect(stream.getAllMarkdown()).toContain('Nenhuma spec');
  });

  it('writes gap-fill prompt file and instructs Copilot Agent for invalid (partial) story', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => partialStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

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

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(fs.writtenPaths().length).toBeGreaterThan(0);
  });

  it('shows DoR success and speckit-implementador instruction for valid story', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('DoR atingido');
    expect(stream.getAllMarkdown()).toContain('speckit-implementador');
  });

  it('shows Session B / speckit-revisor instruction for valid story', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('speckit-revisor');
    expect(stream.getAllMarkdown()).toContain('Sessão B');
  });

  // ── Fix branches ──────────────────────────────────────────────────────────

  it('writes gap-fill.prompt.md and instructs Copilot Agent for invalid (partial) fix', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => partialFixMd;
    const workspace = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/FIX-002.md' });

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

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

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Fix válido');
    expect(stream.getAllMarkdown()).toContain('arquivo(s) gerado(s)');
    expect(fs.writtenPaths().length).toBeGreaterThan(0);
  });

  it('shows speckit-fix-implementador and Session B instruction for a valid fix', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeFixMd;
    const workspace = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/FIX-001.md' });

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('speckit-fix-implementador');
    expect(stream.getAllMarkdown()).toContain('Sessão B');
  });

  it('streams error and returns early when generateFixCopilotConfig throws', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeFixMd;
    const workspace = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/FIX-001.md' });
    workspace.detectTechStack = async () => {
      throw new Error('stack detection failed');
    };

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Erro ao detectar stack');
    expect(stream.getAllMarkdown()).toContain('stack detection failed');
    expect(stream.getAllMarkdown()).not.toContain('/fix-implement');
  });

  // ── Backup integration ────────────────────────────────────────────────────

  it('shows backup message when copilot-instructions.md already exists before validating story', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    // Pre-populate existing copilot-instructions.md
    await fs.writeFile('C:/workspace/.github/copilot-instructions.md', '# Old config');
    fs.readFile = async (p: string) => {
      if (p.replace(/\\/g, '/').includes('copilot-instructions.md')) {
        return '# Old config';
      }
      return completeStoryMd;
    };
    fs.fileExists = async (p: string) => {
      return p.replace(/\\/g, '/').includes('copilot-instructions.md');
    };
    const workspace = new WorkspaceStub();

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Backup');
  });

  it('does not show backup message when no existing copilot-instructions.md', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).not.toContain('Backup');
  });

  // ── DevTools offer ────────────────────────────────────────────────────────

  it('shows devtools offer when no lint tooling exists in workspace (story)', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Tooling de qualidade');
    expect(stream.getAllMarkdown()).toContain('ESLint');
    expect(stream.getAllMarkdown()).toContain('Prettier');
  });

  it('shows all-present message when all devtools exist in workspace (story)', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    // Pre-populate devtools files
    await fs.writeFile('C:/workspace/eslint.config.mjs', 'export default [];');
    await fs.writeFile('C:/workspace/.prettierrc', '{}');
    await fs.writeFile('C:/workspace/.husky/pre-commit', 'npx lint-staged');
    await fs.writeFile(
      'C:/workspace/package.json',
      JSON.stringify({ 'lint-staged': { '*.ts': ['eslint --fix'] } }),
    );
    fs.readFile = async (p: string) => {
      const norm = p.replace(/\\/g, '/');
      if (norm.includes('package.json')) {
        return JSON.stringify({ 'lint-staged': { '*.ts': ['eslint --fix'] } });
      }
      if (norm.includes('eslint.config')) return 'export default [];';
      if (norm.includes('.prettierrc')) return '{}';
      if (norm.includes('pre-commit')) return 'npx lint-staged';
      return completeStoryMd;
    };
    fs.fileExists = async (p: string) => {
      const norm = p.replace(/\\/g, '/');
      return (
        norm.includes('eslint.config.mjs') ||
        norm.includes('.prettierrc') ||
        norm.includes('.husky/pre-commit') ||
        norm.includes('package.json')
      );
    };
    const workspace = new WorkspaceStub();

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('já configurados');
    expect(stream.getAllMarkdown()).not.toContain('incluir skill');
  });

  it('generates devtools skill when --devtools flag is present (story)', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand(
      createMockRequest('--devtools'),
      stream,
      createMockToken(),
      fs,
      workspace,
    );

    expect(stream.getAllMarkdown()).toContain('Skill de DevTools incluído');
    expect(fs.hasFile('speckit-devtools/SKILL.md')).toBe(true);
  });

  it('shows devtools offer for valid fix when no lint tooling exists', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeFixMd;
    const workspace = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/FIX-001.md' });

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Tooling de qualidade');
    expect(stream.getAllMarkdown()).toContain('ESLint');
  });

  it('generates devtools skill when --devtools flag is present (fix)', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeFixMd;
    const workspace = new WorkspaceStub({ activeSpecPath: 'C:/workspace/.speckit/FIX-001.md' });

    await handleValidateCommand(
      createMockRequest('--devtools'),
      stream,
      createMockToken(),
      fs,
      workspace,
    );

    expect(stream.getAllMarkdown()).toContain('Skill de DevTools incluído');
    expect(fs.hasFile('speckit-devtools/SKILL.md')).toBe(true);
  });

  it('devtools offer never breaks validate flow — normal files always generated', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    // Normal flow outputs must still be present
    expect(stream.getAllMarkdown()).toContain('DoR atingido');
    expect(stream.getAllMarkdown()).toContain('arquivo(s) gerado(s)');
    expect(stream.getAllMarkdown()).toContain('speckit-implementador');
    // DevTools offer must appear
    expect(stream.getAllMarkdown()).toContain('Tooling de qualidade');
  });

  // ── Filesystem resilience ─────────────────────────────────────────────────

  it('shows error when spec file cannot be read', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => {
      throw new Error('EACCES: permission denied');
    };
    const workspace = new WorkspaceStub();

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Erro ao ler a spec');
    expect(stream.getAllMarkdown()).toContain('permission denied');
  });

  it('shows error when gap-fill.prompt.md cannot be written (story)', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => {
      return partialStoryMd;
    };
    fs.writeFile = async () => {
      throw new Error('ENOSPC: no space left on device');
    };
    const workspace = new WorkspaceStub();

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Erro ao salvar gap-fill.prompt.md');
    expect(stream.getAllMarkdown()).toContain('no space left');
  });

  it('shows error when config generation fails completely (story)', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    // ensureDir works, but writeFile always fails
    fs.writeFile = async () => {
      throw new Error('disk write error');
    };
    const workspace = new WorkspaceStub();

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Erro ao gerar arquivos de configuração');
  });

  it('respects cancellation token — returns early when cancelled', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();
    const cancelledToken = { isCancellationRequested: true, onCancellationRequested: vi.fn() };

    await handleValidateCommand(createMockRequest(''), stream, cancelledToken, fs, workspace);

    // Should not proceed to generate files
    expect(stream.getAllMarkdown()).not.toContain('arquivo(s) gerado(s)');
    expect(stream.getAllMarkdown()).not.toContain('speckit-implementador');
  });

  // ── Spec size warning ─────────────────────────────────────────────────────

  it('shows warning for large spec but continues normally', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    // Create a spec that's > 50KB by padding the complete story
    const largeContent = completeStoryMd + '\n' + 'x'.repeat(55_000);
    fs.readFile = async () => largeContent;
    const workspace = new WorkspaceStub();

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Spec grande detectada');
    expect(stream.getAllMarkdown()).toContain('Dicas para reduzir');
    // Flow continues — should still validate and generate
    expect(stream.getAllMarkdown()).toContain('DoR atingido');
    expect(stream.getAllMarkdown()).toContain('arquivo(s) gerado(s)');
  });

  it('does not show warning for small spec', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    fs.readFile = async () => completeStoryMd;
    const workspace = new WorkspaceStub();

    await handleValidateCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).not.toContain('Spec grande detectada');
  });
});

// ── warnIfSpecLarge unit tests ────────────────────────────────────────────────

describe('warnIfSpecLarge', () => {
  it('returns false and emits nothing for small content', () => {
    const calls: string[] = [];
    const stream = { markdown: (t: string) => calls.push(t) };

    const warned = warnIfSpecLarge('small content', stream);

    expect(warned).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('returns true and emits warning for content > 50KB', () => {
    const calls: string[] = [];
    const stream = { markdown: (t: string) => calls.push(t) };
    const bigContent = 'x'.repeat(51_000);

    const warned = warnIfSpecLarge(bigContent, stream);

    expect(warned).toBe(true);
    expect(calls.join('')).toContain('Spec grande detectada');
    expect(calls.join('')).toContain('Dicas para reduzir');
  });

  it('includes actionable tips in the warning', () => {
    const calls: string[] = [];
    const stream = { markdown: (t: string) => calls.push(t) };

    warnIfSpecLarge('x'.repeat(51_000), stream);

    const output = calls.join('');
    expect(output).toContain('Requisito de Negócio');
    expect(output).toContain('Given/When/Then');
    expect(output).toContain('processo continua normalmente');
  });
});
