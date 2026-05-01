import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFix } from '../../../src/fix/FixParser';
import { handleFixCommand } from '../../../src/participant/commands/fixCommand';
import {
  createMockFs,
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

vi.mock('vscode', () => ({
  workspace: { openTextDocument: vi.fn().mockResolvedValue({}) },
  window: { showTextDocument: vi.fn().mockResolvedValue(undefined) },
}));

describe('handleFixCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace is open', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    workspace.getWorkspaceRoot = () => undefined;
    const fs = new InMemoryFileSystem();

    await handleFixCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
    expect(fs.writtenPaths().length).toBe(0);
  });

  it('creates FIX-{AAA}-{timestamp}.md when no fixes exist', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ fixFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleFixCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(fs.hasFile('FIX-')).toBe(true);
    const path = fs.writtenPaths().find((p) => p.includes('FIX-'));
    expect(path).toMatch(/FIX-WORKSPACE-\d{8}-\d{4}\.md$/);
    expect(stream.getAllMarkdown()).toMatch(/FIX-WORKSPACE-\d{8}-\d{4}/);
  });

  it('avoids collision with existing fix files by advancing minute', async () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const existingId = `FIX-WORKSPACE-${yyyy}${mm}${dd}-${hh}${min}.md`;
    const workspace = new WorkspaceStub({ fixFiles: [existingId] });
    const fs = new InMemoryFileSystem();
    const stream = createMockStream();

    await handleFixCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const writtenPath = fs.writtenPaths().find((p) => p.includes('FIX-'))!;
    expect(writtenPath).not.toContain(existingId.replace('.md', ''));
    expect(writtenPath).toMatch(/FIX-WORKSPACE-\d{8}-\d{4}\.md$/);
  });

  it('creates file inside .speckit directory', async () => {
    const workspace = new WorkspaceStub();
    const fs = new InMemoryFileSystem();
    const stream = createMockStream();

    await handleFixCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const writtenPath = fs.writtenPaths().find((p) => p.includes('FIX-'))!;
    expect(writtenPath).toContain('.speckit');
  });

  it('writes a template with type: fix in metadata', async () => {
    const workspace = new WorkspaceStub();
    const fs = new InMemoryFileSystem();
    const stream = createMockStream();

    await handleFixCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const content = fs.contentFor('FIX-')!;
    expect(content).toContain('type: fix');
  });

  it('success message includes /validate instruction', async () => {
    const workspace = new WorkspaceStub({ fixFiles: [] });
    const fs = new InMemoryFileSystem();
    const stream = createMockStream();

    await handleFixCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('/validate');
  });

  it('shows error when writeFile fails', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const fs = createMockFs();
    (fs.writeFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('EACCES: permission denied'),
    );

    await handleFixCommand(createMockRequest(''), stream, createMockToken(), fs, ws);

    expect(stream.getAllMarkdown()).toContain('Erro ao salvar o fix');
    expect(stream.getAllMarkdown()).toContain('permission denied');
  });

  // ── Contract test: template → parser ──────────────────────────────────
  it('generated template is parseable by FixParser with correct metadata', async () => {
    const fs = new InMemoryFileSystem();
    const workspace = new WorkspaceStub({ fixFiles: [] });
    const stream = createMockStream();

    await handleFixCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const content = fs.contentFor('FIX-');
    expect(content).toBeDefined();
    const fix = parseFix(content!);
    expect(fix.metadata.type).toBe('fix');
    expect(fix.metadata.id).toMatch(/^FIX-WORKSPACE-\d{8}-\d{4}$/);
  });

  it('generated template contains all mandatory sections', async () => {
    const fs = new InMemoryFileSystem();
    const workspace = new WorkspaceStub({ fixFiles: [] });
    const stream = createMockStream();

    await handleFixCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const content = fs.contentFor('FIX-')!;
    expect(content).toContain('## Bug Description');
    expect(content).toContain('## Root Cause Hypothesis');
    expect(content).toContain('## Impact Assessment');
    expect(content).toContain('## Regression Prevention');
    expect(content).toContain('DoF');
  });

  // ── Audit & Trace coverage ────────────────────────────────────────────
  it('writes traceability entry for new fix', async () => {
    const fs = new InMemoryFileSystem();
    const workspace = new WorkspaceStub({ fixFiles: [] });
    const stream = createMockStream();

    await handleFixCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const traceContent = fs.contentFor('traceability/');
    expect(traceContent).toBeDefined();
    const trace = JSON.parse(traceContent!);
    expect(trace.specType).toBe('fix');
    expect(trace.entries[0].description).toBe('fix created');
  });

  it('writes session log entry for new fix', async () => {
    const fs = new InMemoryFileSystem();
    const workspace = new WorkspaceStub({ fixFiles: [] });
    const stream = createMockStream();

    await handleFixCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const sessionContent = fs.contentFor('session-');
    expect(sessionContent).toBeDefined();
    expect(sessionContent).toContain('/fix');
    expect(sessionContent).toContain('Fix criado');
    expect(sessionContent).toContain('SessionAlias:');
    expect(sessionContent).toContain('AgentMode: implementador');
    expect(sessionContent).toContain('Gate: 0');
  });
});
