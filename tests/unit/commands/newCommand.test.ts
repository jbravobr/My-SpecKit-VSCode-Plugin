import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleNewCommand } from '../../../src/participant/commands/newCommand';
import { parseStory } from '../../../src/story/StoryParser';
import {
  createMockFs,
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

describe('handleNewCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when no workspace is open', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ workspaceRoot: undefined as unknown as string });
    workspace.getWorkspaceRoot = () => undefined;
    const fs = new InMemoryFileSystem();

    await handleNewCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(stream.getAllMarkdown()).toContain('Nenhum workspace');
    expect(fs.writtenPaths().length).toBe(0);
  });

  it('creates US-{AAA}-{timestamp}.md when no stories exist', async () => {
    const stream = createMockStream();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const fs = new InMemoryFileSystem();

    await handleNewCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    expect(fs.hasFile('US-')).toBe(true);
    const path = fs.writtenPaths().find((p) => p.includes('US-'));
    expect(path).toMatch(/US-WORKSPACE-\d{8}-\d{4}\.md$/);
    expect(stream.getAllMarkdown()).toMatch(/US-WORKSPACE-\d{8}-\d{4}/);
  });

  it('avoids collision with existing files by advancing minute', async () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const existingId = `US-WORKSPACE-${yyyy}${mm}${dd}-${hh}${min}.md`;
    const workspace = new WorkspaceStub({ storyFiles: [existingId] });
    const fs = new InMemoryFileSystem();
    const stream = createMockStream();

    await handleNewCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const writtenPath = fs.writtenPaths().find((p) => p.includes('US-'))!;
    expect(writtenPath).not.toContain(existingId.replace('.md', ''));
    expect(writtenPath).toMatch(/US-WORKSPACE-\d{8}-\d{4}\.md$/);
  });

  it('creates file inside .speckit directory', async () => {
    const workspace = new WorkspaceStub();
    const fs = new InMemoryFileSystem();
    const stream = createMockStream();

    await handleNewCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const writtenPath = fs.writtenPaths().find((p) => p.includes('US-'))!;
    expect(writtenPath).toContain('.speckit');
  });

  it('shows error when writeFile fails', async () => {
    const stream = createMockStream();
    const ws = new WorkspaceStub();
    const fs = createMockFs();
    (fs.writeFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('ENOSPC: no space left on device'),
    );

    await handleNewCommand(createMockRequest(''), stream, createMockToken(), fs, ws);

    expect(stream.getAllMarkdown()).toContain('Erro ao salvar a história');
    expect(stream.getAllMarkdown()).toContain('no space left');
  });

  // ── Contract test: template → parser ──────────────────────────────────
  it('generated template is parseable by StoryParser with correct metadata', async () => {
    const fs = new InMemoryFileSystem();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const stream = createMockStream();

    await handleNewCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const content = fs.contentFor('US-');
    expect(content).toBeDefined();
    const story = parseStory(content!);
    expect(story.metadata.type).toBe('story');
    expect(story.metadata.id).toMatch(/^US-WORKSPACE-\d{8}-\d{4}$/);
    expect(story.metadata.gate).toBe(0);
  });

  it('generated template contains all mandatory sections', async () => {
    const fs = new InMemoryFileSystem();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const stream = createMockStream();

    await handleNewCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const content = fs.contentFor('US-')!;
    expect(content).toContain('## Requisito de Negócio');
    expect(content).toContain('## Especificação Funcional');
    expect(content).toContain('## Especificação Técnica');
    expect(content).toContain('DoD');
  });

  // ── Audit & Trace coverage ────────────────────────────────────────────
  it('writes traceability entry for new story', async () => {
    const fs = new InMemoryFileSystem();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const stream = createMockStream();

    await handleNewCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const traceContent = fs.contentFor('traceability/');
    expect(traceContent).toBeDefined();
    const trace = JSON.parse(traceContent!);
    expect(trace.specType).toBe('story');
    expect(trace.entries[0].description).toBe('spec created');
  });

  it('writes session log entry for new story', async () => {
    const fs = new InMemoryFileSystem();
    const workspace = new WorkspaceStub({ storyFiles: [] });
    const stream = createMockStream();

    await handleNewCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const sessionContent = fs.contentFor('session-');
    expect(sessionContent).toBeDefined();
    expect(sessionContent).toContain('/new');
    expect(sessionContent).toContain('História criada');
    expect(sessionContent).toContain('SessionAlias:');
    expect(sessionContent).toContain('AgentMode: implementador');
    expect(sessionContent).toContain('Gate: 0');
  });
});
