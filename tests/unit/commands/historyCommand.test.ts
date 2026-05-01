import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appendLog } from '../../../src/generator/utils/SessionLogger';
import { handleHistoryCommand } from '../../../src/participant/commands/historyCommand';
import { AuditLogger } from '../../../src/workflow/AuditLogger';
import { TraceabilityManager } from '../../../src/workflow/TraceabilityManager';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

const token = createMockToken();

describe('handleHistoryCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    ws.getWorkspaceRoot = () => undefined;

    await handleHistoryCommand(createMockRequest(''), stream, token, new InMemoryFileSystem(), ws);

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
  });

  it('shows empty state when there are no events', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    await handleHistoryCommand(createMockRequest(''), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Nenhum evento de history');
  });

  it('aggregates audit, trace, and session log events', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    const audit = new AuditLogger('C:/workspace', fs);
    await audit.log('command', '/new', { command: '/new', specId: 'US-001' });

    const trace = new TraceabilityManager('C:/workspace', fs);
    await trace.record('US-001', 'story', {
      type: 'custom',
      description: 'batch event',
      data: { command: '/batch', agentMode: 'implementador', gate: '1' },
    });

    await appendLog(
      'C:/workspace',
      {
        command: '/new',
        specId: 'US-001',
        specTitle: 'Nova API',
        outcome: 'ok',
        sessionAlias: 'Nova API + implementador + Gate-1',
        agentMode: 'implementador',
        gate: 1,
      },
      fs,
    );

    const stream = createMockStream();
    await handleHistoryCommand(createMockRequest(''), stream, token, fs, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('History');
    expect(output).toContain('audit');
    expect(output).toContain('trace');
    expect(output).toContain('log');
    expect(output).toContain('US-001');
    expect(output).toContain('Sessões canônicas');
    expect(output).toContain('Nova API + implementador + Gate-1');
  });

  it('applies type filter for trace events', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    const audit = new AuditLogger('C:/workspace', fs);
    await audit.log('command', '/status');

    const trace = new TraceabilityManager('C:/workspace', fs);
    await trace.record('US-002', 'story', {
      type: 'gate',
      description: 'validated at gate 2',
      data: { gate: '2' },
    });

    const stream = createMockStream();
    await handleHistoryCommand(createMockRequest('trace'), stream, token, fs, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('filtro: `trace`');
    expect(output).toContain('validated at gate 2');
    expect(output).not.toContain('/status');
  });

  it('respects limit argument', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    const audit = new AuditLogger('C:/workspace', fs);
    for (let i = 1; i <= 6; i += 1) {
      await audit.log('command', `entry-${i}`);
    }

    const stream = createMockStream();
    await handleHistoryCommand(createMockRequest('audit 3'), stream, token, fs, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('3 de 6 evento');
    expect(output).toContain('entry-6');
    expect(output).toContain('entry-4');
  });

  it('shows sessions-only summary when using sessions view', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    const aliasA = 'Comissao Kafka + implementador + Gate-1';
    const aliasB = 'OAuth Revisao + revisor + Gate-3';

    const audit = new AuditLogger('C:/workspace', fs);
    await audit.log('command', '/new', { sessionAlias: aliasA, specId: 'US-AAA' });
    await audit.log('command', '/validate', { sessionAlias: aliasA, specId: 'US-AAA' });
    await audit.log('command', '/fix', { sessionAlias: aliasB, specId: 'FIX-BBB' });

    const stream = createMockStream();
    await handleHistoryCommand(createMockRequest('sessions 1'), stream, token, fs, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Sessões canônicas');
    expect(output).toContain('Comissao Kafka + implementador + Gate-1');
    expect(output).toContain('Use `@speckit /history session');
  });

  it('supports drill-down by session alias fragment', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    const aliasA = 'Comissao Kafka + implementador + Gate-1';
    const aliasB = 'OAuth Revisao + revisor + Gate-3';

    const audit = new AuditLogger('C:/workspace', fs);
    await audit.log('command', '/new', { sessionAlias: aliasA, specId: 'US-AAA' });
    await audit.log('command', '/validate', { sessionAlias: aliasA, specId: 'US-AAA' });
    await audit.log('command', '/fix', { sessionAlias: aliasB, specId: 'FIX-BBB' });

    const stream = createMockStream();
    await handleHistoryCommand(
      createMockRequest('session implementador 10'),
      stream,
      token,
      fs,
      ws,
    );

    const output = stream.getAllMarkdown();
    expect(output).toContain('Sessão canônica');
    expect(output).toContain('Comissao Kafka + implementador + Gate-1');
    expect(output).toContain('/validate');
    expect(output).not.toContain('OAuth Revisao + revisor + Gate-3');
  });

  it('asks for refinement when session query matches multiple aliases', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    const aliasA = 'Comissao Kafka + implementador + Gate-1';
    const aliasB = 'Checkout Pix + implementador + Gate-2';

    const audit = new AuditLogger('C:/workspace', fs);
    await audit.log('command', '/new', { sessionAlias: aliasA, specId: 'US-AAA' });
    await audit.log('command', '/new', { sessionAlias: aliasB, specId: 'US-BBB' });

    const stream = createMockStream();
    await handleHistoryCommand(createMockRequest('session implementador'), stream, token, fs, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Mais de uma sessão corresponde');
    expect(output).toContain(aliasA);
    expect(output).toContain(aliasB);
  });
});
