import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveAgentMode } from '../../../src/participant/AgentMode';
import { handleAgentCommand } from '../../../src/participant/commands/agentCommand';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

const token = createMockToken();

describe('handleAgentCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActiveAgentMode('default');
  });

  it('should show current mode and list when no args', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    await handleAgentCommand(createMockRequest(''), stream, token, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Modo ativo');
    expect(output).toContain('Default');
    expect(output).toContain('debugger');
    expect(output).toContain('refactor');
    expect(output).toContain('implementador');
    expect(output).toContain('revisor');
  });

  it('should switch to debugger mode and emit protocol', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    await handleAgentCommand(createMockRequest('debugger'), stream, token, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Debugger');
    expect(output).toContain('Hipótese');
    expect(output).toContain('Evidência');
    expect(output).toContain('NÃO corrija sintomas');
    expect(output).toContain('npx vitest run');
  });

  it('should switch to refactor mode and emit protocol', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    await handleAgentCommand(createMockRequest('refactor'), stream, token, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Refactor');
    expect(output).toContain('Snapshot');
    expect(output).toContain('Rollback');
    expect(output).toContain('NÃO adicione features');
  });

  it('should switch to implementador mode', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    await handleAgentCommand(createMockRequest('implementador'), stream, token, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Implementador');
    expect(output).toContain('speckit-implementador');
  });

  it('should switch to revisor mode', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    await handleAgentCommand(createMockRequest('revisor'), stream, token, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Revisor');
    expect(output).toContain('speckit-revisor');
  });

  it('should show error for invalid mode', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    await handleAgentCommand(createMockRequest('invalid'), stream, token, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('❌');
    expect(output).toContain('inválido');
    expect(output).toContain('debugger');
    expect(output).toContain('refactor');
  });

  it('should use java test command when stack is java', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub({
      techStack: {
        language: 'java',
        framework: 'springboot',
        target: 'backend',
        projectStage: 'brownfield',
        confidence: 'high',
        source: 'pom.xml',
      },
    });
    await handleAgentCommand(createMockRequest('debugger'), stream, token, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('mvnw verify');
    expect(output).toContain('java / springboot');
  });

  it('should use python test command when stack is python', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub({
      techStack: {
        language: 'python',
        framework: 'fastapi',
        target: 'backend',
        projectStage: 'brownfield',
        confidence: 'high',
        source: 'pyproject.toml',
      },
    });
    await handleAgentCommand(createMockRequest('refactor'), stream, token, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('pytest');
  });

  it('should handle case-insensitive mode input', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    await handleAgentCommand(createMockRequest('DEBUGGER'), stream, token, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Debugger');
    expect(output).not.toContain('inválido');
  });

  it('should trim whitespace from input', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    await handleAgentCommand(createMockRequest('  refactor  '), stream, token, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Refactor');
    expect(output).not.toContain('inválido');
  });

  // ── Audit & Trace coverage ────────────────────────────────────────────
  it('writes session log entry when mode changes', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const fs = new InMemoryFileSystem();

    await handleAgentCommand(createMockRequest('debugger'), stream, token, ws, fs);

    const sessionContent = fs.contentFor('session-');
    expect(sessionContent).toBeDefined();
    expect(sessionContent).toContain('/agent');
    expect(sessionContent).toContain('Debugger');
    expect(sessionContent).toContain('SessionAlias:');
    expect(sessionContent).toContain('AgentMode: debugger');
  });
});
