import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTraceCommand } from '../../../src/participant/commands/traceCommand';
import { TraceabilityManager } from '../../../src/workflow/TraceabilityManager';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

const token = createMockToken();

describe('handleTraceCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    ws.getWorkspaceRoot = () => undefined;

    await handleTraceCommand(createMockRequest(''), stream, token, new InMemoryFileSystem(), ws);

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
  });

  it('shows empty message when no traces exist', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    await handleTraceCommand(createMockRequest(''), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Nenhum registro de rastreabilidade');
  });

  it('lists all traces with summary table', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();
    const tm = new TraceabilityManager('C:/workspace', fs);
    await tm.record('US-APP-001', 'story', {
      type: 'file',
      description: 'spec created',
      data: { specId: 'US-APP-001' },
    });
    await tm.record('FIX-APP-001', 'fix', {
      type: 'file',
      description: 'fix created',
      data: { specId: 'FIX-APP-001' },
    });

    const stream = createMockStream();
    await handleTraceCommand(createMockRequest(''), stream, token, fs, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Rastreabilidade');
    expect(output).toContain('2 spec(s)');
    expect(output).toContain('US-APP-001');
    expect(output).toContain('FIX-APP-001');
    expect(output).toContain('story');
    expect(output).toContain('fix');
  });

  it('lists traces when "list" arg', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();
    const tm = new TraceabilityManager('C:/workspace', fs);
    await tm.record('US-APP-001', 'story', { type: 'file', description: 'created', data: {} });

    const stream = createMockStream();
    await handleTraceCommand(createMockRequest('list'), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('US-APP-001');
  });

  it('shows detail for specific spec id', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();
    const tm = new TraceabilityManager('C:/workspace', fs);
    await tm.record('US-APP-001', 'story', {
      type: 'file',
      description: 'spec created',
      data: { specId: 'US-APP-001', fileName: 'US-APP-001.md' },
    });
    await tm.record('US-APP-001', 'story', {
      type: 'gate',
      description: 'validated',
      data: { gate: '0' },
    });

    const stream = createMockStream();
    await handleTraceCommand(createMockRequest('US-APP-001'), stream, token, fs, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Trace');
    expect(output).toContain('US-APP-001');
    expect(output).toContain('spec created');
    expect(output).toContain('validated');
    expect(output).toContain('Histórico');
  });

  it('shows error when spec id not found', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    const stream = createMockStream();
    await handleTraceCommand(createMockRequest('NONEXISTENT'), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Nenhum trace encontrado');
    expect(stream.getAllMarkdown()).toContain('NONEXISTENT');
  });

  it('shows entry data in detail view', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();
    const tm = new TraceabilityManager('C:/workspace', fs);
    await tm.record('US-APP-001', 'story', {
      type: 'file',
      description: 'created',
      data: { fileName: 'story.md' },
    });

    const stream = createMockStream();
    await handleTraceCommand(createMockRequest('US-APP-001'), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('fileName: story.md');
  });
});
