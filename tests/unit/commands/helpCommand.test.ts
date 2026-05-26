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
    expect(output).toContain('/review-auto');
    expect(output).toContain('/gate');
    expect(output).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '📊 Ver Status das Specs',
      command: 'speckit.runChatQuickAction',
      arguments: ['@speckit /status'],
    });
  });

  it('shows topic-specific help for review-auto', async () => {
    const stream = createMockStream();

    await handleHelpCommand(createMockRequest('review-auto'), stream, createMockToken());

    const output = stream.getAllMarkdown();
    expect(output).toContain('/review-auto');
    expect(output).toContain('--changes-requested');
    expect(output).toContain('--approved');
    expect(output).toContain('--mutation');
    expect(output).toContain('--skip-dry-run');
    expect(output).toContain('@speckit /review-auto --confirm <codigo>');
    expect(output).toContain('@speckit /review-auto --approved --confirm <codigo>');
    expect(output).toContain('@speckit /review-auto --changes-requested --confirm <codigo>');
    expect(output).toContain('@speckit /review-auto --batch-consent --confirm <codigo>');
    expect(output).toContain('nada muda sem confirmação');
    expect(output).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '▶ Iniciar Revisão Automática',
      command: 'speckit.runChatQuickAction',
      arguments: ['@speckit /review-auto'],
    });
  });

  it('shows topic-specific help for status', async () => {
    const stream = createMockStream();

    await handleHelpCommand(createMockRequest('status'), stream, createMockToken());

    const output = stream.getAllMarkdown();
    expect(output).toContain('/status');
    expect(output).toContain('--all');
    expect(output).toContain('--closed');
  });

  it('shows branch governance options in batch help', async () => {
    const stream = createMockStream();

    await handleHelpCommand(createMockRequest('batch'), stream, createMockToken());

    const output = stream.getAllMarkdown();
    expect(output).toContain('/batch');
    expect(output).toContain('--branch-strategy <session|cited>');
    expect(output).toContain('--confirm <codigo>');
  });

  it('maps topic aliases to command help', async () => {
    const stream = createMockStream();

    await handleHelpCommand(createMockRequest('help-status'), stream, createMockToken());

    const output = stream.getAllMarkdown();
    expect(output).toContain('/status');
    expect(output).toContain('--all');
  });

  it('shows topic-specific help for gate', async () => {
    const stream = createMockStream();

    await handleHelpCommand(createMockRequest('gate'), stream, createMockToken());

    const output = stream.getAllMarkdown();
    expect(output).toContain('/gate');
    expect(output).toContain('check gate <de> <para>');
    expect(output).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '🚪 Mostrar Regras de Gate',
      command: 'speckit.runChatQuickAction',
      arguments: ['@speckit /gate'],
    });
  });

  it('shows available topics for unknown help target', async () => {
    const stream = createMockStream();

    await handleHelpCommand(createMockRequest('xpto'), stream, createMockToken());

    const output = stream.getAllMarkdown();
    expect(output).toContain('Comando não reconhecido');
    expect(output).toContain('Tópicos disponíveis');
    expect(output).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '📘 Abrir Ajuda Geral',
      command: 'speckit.runChatQuickAction',
      arguments: ['@speckit /help'],
    });
  });
});
