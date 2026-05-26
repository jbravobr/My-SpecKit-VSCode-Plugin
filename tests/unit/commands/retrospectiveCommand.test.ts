import { describe, expect, it } from 'vitest';
import { handleRetrospectiveCommand } from '../../../src/participant/commands/retrospectiveCommand';
import {
  createMockRequest,
  createMockStream,
  createMockToken,
  InMemoryFileSystem,
  WorkspaceStub,
} from '../../support/fakes';

async function writeJson(fs: InMemoryFileSystem, filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

describe('handleRetrospectiveCommand', () => {
  it('renders markdown report with summary tables and recommendations', async () => {
    const fs = new InMemoryFileSystem();
    const workspace = new WorkspaceStub({ workspaceRoot: 'C:/workspace' });
    const stream = createMockStream();

    await writeJson(fs, 'C:/workspace/.speckit/traceability/STORY-501.json', {
      specId: 'STORY-501',
      entries: [],
    });
    await writeJson(fs, 'C:/workspace/.speckit/traceability/STORY-502.json', {
      specId: 'STORY-502',
      entries: [],
    });
    await writeJson(fs, 'C:/workspace/.speckit/state/iteration-counters/STORY-501.json', {
      perGate: { '2': 4 },
      updatedAt: '2026-05-01T00:00:00.000Z',
    });
    await writeJson(fs, 'C:/workspace/.speckit/state/iteration-counters/STORY-502.json', {
      perGate: { '2': 2, '3': 1 },
      updatedAt: '2026-05-02T00:00:00.000Z',
    });
    await writeJson(fs, 'C:/workspace/.speckit/evidence/STORY-501-run-1.json', {
      specId: 'STORY-501',
      findings: [
        { message: 'Coverage summary não encontrado em coverage/story-501.json.', severity: 'error' },
      ],
    });
    await writeJson(fs, 'C:/workspace/.speckit/evidence/STORY-502-run-1.json', {
      specId: 'STORY-502',
      findings: [
        { message: 'Coverage summary não encontrado em coverage/story-502.json.', severity: 'error' },
      ],
    });

    await handleRetrospectiveCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('## 🔁 Retrospectiva SpecKit');
    expect(output).toContain('**Specs analisadas:** 2');
    expect(output).toContain('### Resumo de iterações por gate');
    expect(output).toContain('Gate 2 — Implementação');
    expect(output).toContain('### Top achados recorrentes');
    expect(output).toContain('Coverage summary não encontrado');
    expect(output).toContain('### Recomendações acionáveis');
    expect(output).toContain('Quick actions de melhoria');
    expect(stream.button).toHaveBeenCalledTimes(3);
  });

  it('shows helpful guidance when there is no historical data', async () => {
    const fs = new InMemoryFileSystem();
    const workspace = new WorkspaceStub({ workspaceRoot: 'C:/workspace' });
    const stream = createMockStream();

    await handleRetrospectiveCommand(createMockRequest(''), stream, createMockToken(), fs, workspace);

    const output = stream.getAllMarkdown();
    expect(output).toContain('Ainda não há histórico suficiente');
    expect(output).toContain('/verify');
    expect(output).toContain('/history');
    expect(output).toContain('/metrics');
    expect(stream.button).toHaveBeenCalledTimes(3);
  });
});
