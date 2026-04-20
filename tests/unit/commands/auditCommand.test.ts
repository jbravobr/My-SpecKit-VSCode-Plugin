import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAuditCommand } from '../../../src/participant/commands/auditCommand';
import { AuditLogger } from '../../../src/workflow/AuditLogger';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

const token = createMockToken();

describe('handleAuditCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    ws.getWorkspaceRoot = () => undefined;

    await handleAuditCommand(createMockRequest(''), stream, token, new InMemoryFileSystem(), ws);

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
  });

  it('shows empty message when no log exists', async () => {
    const stream = createMockStream();
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    await handleAuditCommand(createMockRequest(''), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('Nenhum registro');
  });

  it('shows last 20 entries by default', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    // Seed 25 audit entries
    const logger = new AuditLogger('C:/workspace', fs);
    for (let i = 1; i <= 25; i++) {
      await logger.log('command', `entry-${i}`);
    }

    const stream = createMockStream();
    await handleAuditCommand(createMockRequest(''), stream, token, fs, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('últimas 20 de 25');
    expect(output).toContain('entry-25');
    expect(output).toContain('entry-6');
    expect(output).not.toContain('entry-5\n');
  });

  it('respects custom limit argument', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    const logger = new AuditLogger('C:/workspace', fs);
    for (let i = 1; i <= 10; i++) {
      await logger.log('command', `entry-${i}`);
    }

    const stream = createMockStream();
    await handleAuditCommand(createMockRequest('3'), stream, token, fs, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('últimas 3 de 10');
    expect(output).toContain('entry-10');
    expect(output).toContain('entry-8');
  });

  it('renders entries in code block', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();

    const logger = new AuditLogger('C:/workspace', fs);
    await logger.log('command', '/new');

    const stream = createMockStream();
    await handleAuditCommand(createMockRequest(''), stream, token, fs, ws);

    const output = stream.getAllMarkdown();
    expect(output).toContain('```');
    expect(output).toContain('command: /new');
  });

  it('clamps limit to minimum 1', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub();
    const logger = new AuditLogger('C:/workspace', fs);
    await logger.log('command', '/status');

    const stream = createMockStream();
    await handleAuditCommand(createMockRequest('0'), stream, token, fs, ws);

    expect(stream.getAllMarkdown()).toContain('últimas 1 de 1');
  });
});
