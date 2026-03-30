import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSetupCommand, formatReport } from '../../../src/participant/commands/setupCommand';
import { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import { IWorkspace } from '../../../src/generator/utils/IWorkspace';
import type { EnvironmentReport } from '../../../src/generator/utils/EnvironmentChecker';

vi.mock('../../../src/generator/utils/EnvironmentChecker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/generator/utils/EnvironmentChecker')>();
  return { ...actual, checkEnvironment: vi.fn() };
});

vi.mock('../../../src/generator/utils/SessionLogger', () => ({
  appendLog: vi.fn().mockResolvedValue(undefined),
}));

import { checkEnvironment } from '../../../src/generator/utils/EnvironmentChecker';

function createMockStream() {
  const calls: string[] = [];
  return {
    markdown: vi.fn((t: string) => { calls.push(t); }),
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

const allOkReport: EnvironmentReport = {
  stackLanguage: 'typescript',
  tools: [
    { name: 'Git', cmd: 'git --version', available: true, version: '2.43.0', required: true },
    { name: 'Node.js', cmd: 'node --version', available: true, version: '20.11.0', required: true },
    { name: 'npm', cmd: 'npm --version', available: true, version: '10.2.4', required: true },
  ],
};

const missingGitReport: EnvironmentReport = {
  stackLanguage: 'typescript',
  tools: [
    { name: 'Git', cmd: 'git --version', available: false, required: true },
    { name: 'Node.js', cmd: 'node --version', available: true, version: '20.11.0', required: true },
    { name: 'npm', cmd: 'npm --version', available: true, version: '10.2.4', required: true },
  ],
};

const pythonReport: EnvironmentReport = {
  stackLanguage: 'python',
  tools: [
    { name: 'Git', cmd: 'git --version', available: true, version: '2.43.0', required: true },
    { name: 'Python', cmd: 'python3 --version', available: true, version: '3.12.0', required: true },
    { name: 'pip', cmd: 'pip3 --version', available: true, version: '24.0', required: true },
  ],
};

describe('handleSetupCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when no workspace is open', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({ getWorkspaceRoot: vi.fn().mockReturnValue(undefined) });
    vi.mocked(checkEnvironment).mockReturnValue(allOkReport);

    await handleSetupCommand({} as any, stream as any, {} as any, createMockFs(), workspace);

    expect(stream.getAllMarkdown()).toContain('❌');
    expect(stream.getAllMarkdown()).toContain('/setup');
    expect(checkEnvironment).not.toHaveBeenCalled();
  });

  it('calls checkEnvironment with detected stack', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    vi.mocked(checkEnvironment).mockReturnValue(allOkReport);

    await handleSetupCommand({} as any, stream as any, {} as any, createMockFs(), workspace);

    expect(checkEnvironment).toHaveBeenCalledWith(expect.objectContaining({ language: 'typescript' }));
  });

  it('calls checkEnvironment with undefined when stack detection fails', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace({
      detectTechStack: vi.fn().mockRejectedValue(new Error('Stack não detectada')),
    });
    vi.mocked(checkEnvironment).mockReturnValue({ tools: [], stackLanguage: undefined });

    await handleSetupCommand({} as any, stream as any, {} as any, createMockFs(), workspace);

    expect(checkEnvironment).toHaveBeenCalledWith(undefined);
  });

  it('streams formatted report', async () => {
    const stream = createMockStream();
    const workspace = createMockWorkspace();
    vi.mocked(checkEnvironment).mockReturnValue(allOkReport);

    await handleSetupCommand({} as any, stream as any, {} as any, createMockFs(), workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('SpecKit — Verificação de Ambiente');
    expect(output).toContain('C:\\workspace');
    expect(output).toContain('TypeScript');
  });
});

describe('formatReport', () => {
  it('includes workspace path in output', () => {
    const result = formatReport(allOkReport, '/my/project');
    expect(result).toContain('/my/project');
  });

  it('shows stack language label', () => {
    const result = formatReport(allOkReport, '/project');
    expect(result).toContain('TypeScript');
  });

  it('marks all tools OK when all available', () => {
    const result = formatReport(allOkReport, '/project');
    expect(result).toContain('✅ OK');
    expect(result).toContain('✅ **Todas as ferramentas obrigatórias estão disponíveis.**');
  });

  it('lists missing tools with install link', () => {
    const result = formatReport(missingGitReport, '/project');
    expect(result).toContain('❌ Não encontrado');
    expect(result).toContain('❌ **Ferramentas obrigatórias não encontradas:**');
    expect(result).toContain('Git');
    expect(result).toContain('https://git-scm.com/downloads');
  });

  it('renders Python section for python stack', () => {
    const result = formatReport(pythonReport, '/project');
    expect(result).toContain('Runtime — Python');
    expect(result).toContain('Python');
    expect(result).toContain('pip');
  });

  it('shows unknown stack label when no language', () => {
    const report: EnvironmentReport = { tools: [], stackLanguage: undefined };
    const result = formatReport(report, '/project');
    expect(result).toContain('não identificada');
  });
});
