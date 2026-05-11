import { describe, expect, it } from 'vitest';
import { handleGateCommand } from '../../../src/participant/commands/gateCommand';
import { createMockRequest, createMockStream, createMockToken } from '../../support/fakes';

const token = createMockToken();

describe('handleGateCommand', () => {
  // ── Rules display ─────────────────────────────────────────────────────
  it('shows rules table when no args', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest(''), stream, token);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Regras de Gate');
    expect(output).toContain('Gate 0');
    expect(output).toContain('Gate 4');
    expect(output).toContain('Alinhamento');
    expect(output).toContain('Entrega');
    expect(output).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '📊 Ver Status das Specs',
      command: 'speckit.runChatQuickAction',
      arguments: ['@speckit /status'],
    });
  });

  it('shows rules table when "rules" arg', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('rules'), stream, token);
    expect(stream.getAllMarkdown()).toContain('Regras de Gate');
  });

  it('shows status transitions in rules', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest(''), stream, token);
    const output = stream.getAllMarkdown();
    expect(output).toContain('`open`');
    expect(output).toContain('`done`');
    expect(output).toContain('terminal');
  });

  // ── Gate check ────────────────────────────────────────────────────────
  it('allows valid gate transition 0 → 1', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('check gate 0 1'), stream, token);
    const output = stream.getAllMarkdown();
    expect(output).toContain('✅');
    expect(output).toContain('PERMITIDO');
  });

  it('blocks invalid gate transition 0 → 2', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('check gate 0 2'), stream, token);
    const output = stream.getAllMarkdown();
    expect(output).toContain('❌');
    expect(output).toContain('BLOQUEADO');
  });

  it('shows rework reason for gate regression', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('check gate 2 1'), stream, token);
    const output = stream.getAllMarkdown();
    expect(output).toContain('✅');
    expect(output).toContain('Rework');
  });

  it('shows next valid gates after check', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('check gate 0 1'), stream, token);
    expect(stream.getAllMarkdown()).toContain('Próximos gates válidos');
    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '▶ Validar 0 → 1',
      command: 'speckit.runChatQuickAction',
      arguments: ['@speckit /gate check gate 0 1'],
    });
    expect(stream.button).toHaveBeenCalledWith({
      title: '📊 Ver Status das Specs',
      command: 'speckit.runChatQuickAction',
      arguments: ['@speckit /status'],
    });
  });

  it('rejects non-numeric gate values', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('check gate abc 1'), stream, token);
    expect(stream.getAllMarkdown()).toContain('números de 0 a 4');
    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '▶ Validar Gate 0 → 1',
      command: 'speckit.runChatQuickAction',
      arguments: ['@speckit /gate check gate 0 1'],
    });
  });

  it('rejects gate values out of range', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('check gate 0 5'), stream, token);
    expect(stream.getAllMarkdown()).toContain('números de 0 a 4');
  });

  // ── Status check ──────────────────────────────────────────────────────
  it('allows valid status transition open → in-progress', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('check status open in-progress'), stream, token);
    const output = stream.getAllMarkdown();
    expect(output).toContain('✅');
    expect(output).toContain('PERMITIDO');
  });

  it('blocks invalid status transition open → done', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('check status open done'), stream, token);
    const output = stream.getAllMarkdown();
    expect(output).toContain('❌');
    expect(output).toContain('BLOQUEADO');
  });

  it('blocks transition from terminal status done', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('check status done open'), stream, token);
    expect(stream.getAllMarkdown()).toContain('❌');
  });

  it('rejects invalid status value', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('check status invalid open'), stream, token);
    expect(stream.getAllMarkdown()).toContain('Status inválido');
    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '▶ Validar Status open → in-progress',
      command: 'speckit.runChatQuickAction',
      arguments: ['@speckit /gate check status open in-progress'],
    });
  });

  it('shows next valid statuses after check', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('check status open in-progress'), stream, token);
    expect(stream.getAllMarkdown()).toContain('Próximos statuses válidos');
    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '📊 Ver Status das Specs',
      command: 'speckit.runChatQuickAction',
      arguments: ['@speckit /status'],
    });
  });

  // ── Invalid usage ─────────────────────────────────────────────────────
  it('shows usage when check has insufficient args', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('check gate 0'), stream, token);
    expect(stream.getAllMarkdown()).toContain('Uso inválido');
    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '🚪 Mostrar Regras de Gate',
      command: 'speckit.runChatQuickAction',
      arguments: ['@speckit /gate'],
    });
  });

  it('shows error for unknown check type', async () => {
    const stream = createMockStream();
    await handleGateCommand(createMockRequest('check unknown 0 1'), stream, token);
    expect(stream.getAllMarkdown()).toContain('Tipo inválido');
    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis agora (contextuais)');
    expect(stream.button).toHaveBeenCalledWith({
      title: '🚪 Mostrar Regras de Gate',
      command: 'speckit.runChatQuickAction',
      arguments: ['@speckit /gate'],
    });
  });
});
