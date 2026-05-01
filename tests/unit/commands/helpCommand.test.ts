import { describe, expect, it } from 'vitest';
import { handleHelpCommand } from '../../../src/participant/commands/helpCommand';
import { createMockRequest, createMockStream, createMockToken } from '../../support/fakes';

describe('handleHelpCommand', () => {
  it('shows general help when no topic is provided', async () => {
    const stream = createMockStream();

    await handleHelpCommand(createMockRequest(''), stream, createMockToken());

    const output = stream.getAllMarkdown();
    expect(output).toContain('Ajuda rápida');
    expect(output).toContain('/status-all');
    expect(output).toContain('/batch-unified');
  });

  it('shows topic-specific help for status', async () => {
    const stream = createMockStream();

    await handleHelpCommand(createMockRequest('status'), stream, createMockToken());

    const output = stream.getAllMarkdown();
    expect(output).toContain('/status');
    expect(output).toContain('--all');
    expect(output).toContain('--closed');
  });

  it('maps topic aliases to command help', async () => {
    const stream = createMockStream();

    await handleHelpCommand(createMockRequest('help-status'), stream, createMockToken());

    const output = stream.getAllMarkdown();
    expect(output).toContain('/status');
    expect(output).toContain('--all');
  });

  it('shows available topics for unknown help target', async () => {
    const stream = createMockStream();

    await handleHelpCommand(createMockRequest('xpto'), stream, createMockToken());

    const output = stream.getAllMarkdown();
    expect(output).toContain('Comando não reconhecido');
    expect(output).toContain('Tópicos disponíveis');
  });
});
