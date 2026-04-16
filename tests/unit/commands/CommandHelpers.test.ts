import { describe, expect, it } from 'vitest';
import {
  handleCommandError,
  requireWorkspace,
} from '../../../src/participant/commands/CommandHelpers';
import { createMockStream, WorkspaceStub } from '../../support/fakes';

describe('requireWorkspace', () => {
  it('returns workspace root when available', () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub();
    const root = requireWorkspace(workspace, stream);
    expect(root).toBe('C:/workspace');
    expect(stream.getAllMarkdown()).toBe('');
  });

  it('returns undefined and emits error when workspace root is missing', () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    workspace.getWorkspaceRoot = () => undefined;
    const root = requireWorkspace(workspace, stream);
    expect(root).toBeUndefined();
    expect(stream.getAllMarkdown()).toContain('Nenhum workspace aberto');
  });
});

describe('handleCommandError', () => {
  it('formats Error instances with message', () => {
    const stream = createMockStream();
    handleCommandError(new Error('disk full'), stream, 'Erro ao salvar');
    expect(stream.getAllMarkdown()).toContain('**Erro ao salvar:**');
    expect(stream.getAllMarkdown()).toContain('disk full');
  });

  it('formats non-Error values with String()', () => {
    const stream = createMockStream();
    handleCommandError('unexpected string', stream, 'Erro genérico');
    expect(stream.getAllMarkdown()).toContain('**Erro genérico:**');
    expect(stream.getAllMarkdown()).toContain('unexpected string');
  });

  it('handles null/undefined errors gracefully', () => {
    const stream = createMockStream();
    handleCommandError(null, stream, 'Context');
    expect(stream.getAllMarkdown()).toContain('**Context:**');
    expect(stream.getAllMarkdown()).toContain('null');
  });
});
