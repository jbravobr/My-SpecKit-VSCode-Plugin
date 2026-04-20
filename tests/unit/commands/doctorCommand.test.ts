import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleDoctorCommand } from '../../../src/participant/commands/doctorCommand';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

const token = createMockToken();

describe('handleDoctorCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows error when no workspace', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    ws.getWorkspaceRoot = () => undefined;

    await handleDoctorCommand(createMockRequest(''), stream, token, new InMemoryFileSystem(), ws);

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
  });

  it('reports all checks for healthy workspace', async () => {
    const fs = new InMemoryFileSystem();
    // InMemoryFileSystem needs exact paths — directories are detected via marker files
    await fs.writeFile('C:/workspace/.speckit', '');
    await fs.writeFile('C:/workspace/.speckit/defaults.yml', 'language: typescript');
    await fs.writeFile('C:/workspace/.github', '');
    await fs.writeFile('C:/workspace/.github/copilot.yml', '---');
    const ws = new WorkspaceStub({ storyFiles: ['STORY-001.md'], fixFiles: ['FIX-001.md'] });
    const stream = createMockStream();

    await handleDoctorCommand(createMockRequest(''), stream, token, fs, ws);

    const md = stream.getAllMarkdown();
    expect(md).toContain('Diagnóstico');
    expect(md).toContain('6/6 verificações OK');
  });

  it('reports missing .speckit folder', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ storyFiles: [], fixFiles: [] });
    const stream = createMockStream();

    await handleDoctorCommand(createMockRequest(''), stream, token, fs, ws);

    const md = stream.getAllMarkdown();
    expect(md).toContain('❌');
    expect(md).toContain('.speckit/');
  });

  it('reports stories and fixes counts', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('C:/workspace/.speckit/dummy', '');
    const ws = new WorkspaceStub({ storyFiles: ['S1.md', 'S2.md'], fixFiles: [] });
    const stream = createMockStream();

    await handleDoctorCommand(createMockRequest(''), stream, token, fs, ws);

    const md = stream.getAllMarkdown();
    expect(md).toContain('2 encontrada(s)');
    expect(md).toContain('0 encontrado(s)');
  });

  it('reports detected tech stack', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('C:/workspace/.speckit/dummy', '');
    const ws = new WorkspaceStub({
      techStack: {
        language: 'typescript',
        framework: 'react',
        target: 'frontend',
        projectStage: 'brownfield',
        confidence: 'high',
        source: 'package.json',
      },
    });
    const stream = createMockStream();

    await handleDoctorCommand(createMockRequest(''), stream, token, fs, ws);

    const md = stream.getAllMarkdown();
    expect(md).toContain('typescript / react (high)');
  });

  it('handles partial health — some OK, some missing', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('C:/workspace/.speckit', '');
    await fs.writeFile('C:/workspace/.speckit/defaults.yml', 'language: java');
    // .github/ doesn't exist
    const ws = new WorkspaceStub({ storyFiles: ['S1.md'], fixFiles: [] });
    const stream = createMockStream();

    await handleDoctorCommand(createMockRequest(''), stream, token, fs, ws);

    const md = stream.getAllMarkdown();
    // .speckit ✅, defaults ✅, stories ✅, tech stack ✅, but .github ❌, fixes ❌
    expect(md).toContain('4/6 verificações OK');
  });
});
