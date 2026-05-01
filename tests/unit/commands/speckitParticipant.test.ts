import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSpeckitRequest } from '../../../src/participant/speckitParticipant';
import {
  createMockContext,
  createMockRequest,
  createMockStream,
  createMockToken,
} from '../../support/fakes';

describe('handleSpeckitRequest — dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes /new to handleNewCommand', async () => {
    const stream = createMockStream();
    await handleSpeckitRequest(
      createMockRequest('', 'new'),
      createMockContext(),
      stream,
      createMockToken(),
    );
    // newCommand requires workspace — with no real workspace it shows error,
    // proving it was routed (not the help menu)
    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
    expect(stream.getAllMarkdown()).not.toContain('Comandos disponíveis');
  });

  it('routes /fix to handleFixCommand', async () => {
    const stream = createMockStream();
    await handleSpeckitRequest(
      createMockRequest('', 'fix'),
      createMockContext(),
      stream,
      createMockToken(),
    );
    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
    expect(stream.getAllMarkdown()).not.toContain('Comandos disponíveis');
  });

  it('routes /validate to handleValidateCommand', async () => {
    const stream = createMockStream();
    await handleSpeckitRequest(
      createMockRequest('', 'validate'),
      createMockContext(),
      stream,
      createMockToken(),
    );
    expect(stream.getAllMarkdown()).toContain('workspace');
    expect(stream.getAllMarkdown()).not.toContain('Comandos disponíveis');
  });

  it('routes /status to handleStatusCommand', async () => {
    const stream = createMockStream();
    await handleSpeckitRequest(
      createMockRequest('', 'status'),
      createMockContext(),
      stream,
      createMockToken(),
    );
    expect(stream.getAllMarkdown()).toContain('workspace');
    expect(stream.getAllMarkdown()).not.toContain('Comandos disponíveis');
  });

  it('routes /draft to handleDraftCommand', async () => {
    const stream = createMockStream();
    await handleSpeckitRequest(
      createMockRequest('', 'draft'),
      createMockContext(),
      stream,
      createMockToken(),
    );
    // draft with empty prompt shows usage error
    expect(stream.getAllMarkdown()).not.toContain('Comandos disponíveis');
  });

  it('routes /agent to handleAgentCommand', async () => {
    const stream = createMockStream();
    await handleSpeckitRequest(
      createMockRequest('', 'agent'),
      createMockContext(),
      stream,
      createMockToken(),
    );
    // agent with no args shows current mode
    expect(stream.getAllMarkdown()).not.toContain('Comandos disponíveis');
  });

  it('routes /history to handleHistoryCommand', async () => {
    const stream = createMockStream();
    await handleSpeckitRequest(
      createMockRequest('', 'history'),
      createMockContext(),
      stream,
      createMockToken(),
    );
    expect(stream.getAllMarkdown()).toContain('workspace');
    expect(stream.getAllMarkdown()).not.toContain('Comandos disponíveis');
  });

  it('shows help menu for unknown command', async () => {
    const stream = createMockStream();
    await handleSpeckitRequest(
      createMockRequest('', 'unknown'),
      createMockContext(),
      stream,
      createMockToken(),
    );
    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis');
    expect(stream.getAllMarkdown()).toContain('/new');
    expect(stream.getAllMarkdown()).toContain('/fix');
    expect(stream.getAllMarkdown()).toContain('/validate');
    expect(stream.getAllMarkdown()).toContain('/status');
    expect(stream.getAllMarkdown()).toContain('/draft');
    expect(stream.getAllMarkdown()).toContain('/agent');
    expect(stream.getAllMarkdown()).toContain('/history');
  });

  it('shows help menu when no command is provided', async () => {
    const stream = createMockStream();
    await handleSpeckitRequest(
      createMockRequest(''),
      createMockContext(),
      stream,
      createMockToken(),
    );
    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis');
  });
});
