import { describe, expect, it } from 'vitest';
import { analyzeRetrospective } from '../../../src/workflow/RetrospectiveAnalyzer';
import { InMemoryFileSystem } from '../../support/fakes';

const WORKSPACE_ROOT = 'C:/workspace';

async function writeJson(fs: InMemoryFileSystem, filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

describe('analyzeRetrospective', () => {
  it('returns empty report when workspace has no history', async () => {
    const fs = new InMemoryFileSystem();

    const report = await analyzeRetrospective({ workspaceRoot: WORKSPACE_ROOT, fs });

    expect(report.isEmpty).toBe(true);
    expect(report.specCount).toBe(0);
    expect(report.topRecurringFindings).toEqual([]);
    expect(report.recommendations[0]).toContain('Nenhum histórico encontrado');
  });

  it('computes average iterations per gate across specs', async () => {
    const fs = new InMemoryFileSystem();

    await writeJson(fs, 'C:/workspace/.speckit/traceability/STORY-101.json', {
      specId: 'STORY-101',
      entries: [],
    });
    await writeJson(fs, 'C:/workspace/.speckit/traceability/STORY-202.json', {
      specId: 'STORY-202',
      entries: [],
    });
    await writeJson(fs, 'C:/workspace/.speckit/state/iteration-counters/STORY-101.json', {
      perGate: { '2': 3, '3': 1 },
      updatedAt: '2026-05-01T00:00:00.000Z',
    });
    await writeJson(fs, 'C:/workspace/.speckit/state/iteration-counters/STORY-202.json', {
      perGate: { '2': 1 },
      updatedAt: '2026-05-02T00:00:00.000Z',
    });

    const report = await analyzeRetrospective({ workspaceRoot: WORKSPACE_ROOT, fs });

    expect(report.isEmpty).toBe(false);
    expect(report.specCount).toBe(2);
    expect(report.avgIterationsPerGate['Gate 2 — Implementação']).toBe(2);
    expect(report.avgIterationsPerGate['Gate 3 — Validação']).toBe(0.5);
    expect(report.mostRegressedGates[0]).toEqual({ gate: 2, regressionCount: 4 });
  });

  it('groups recurring findings by normalized message pattern', async () => {
    const fs = new InMemoryFileSystem();

    await writeJson(fs, 'C:/workspace/.speckit/traceability/STORY-303.json', {
      specId: 'STORY-303',
      entries: [],
    });
    await fs.writeFile(
      'C:/workspace/.speckit/audit/STORY-303.jsonl',
      [
        JSON.stringify({
          specId: 'STORY-303',
          findings: [{ message: 'Coverage summary não encontrado em coverage/story-303.json.', severity: 'error' }],
        }),
        JSON.stringify({
          specId: 'STORY-303',
          findings: [{ message: 'Coverage summary não encontrado em coverage/story-999.json.', severity: 'error' }],
        }),
        JSON.stringify({
          specId: 'STORY-303',
          findings: [{ message: 'Typecheck nativo indisponível para stack "python".', severity: 'warn' }],
        }),
      ].join('\n'),
    );

    const report = await analyzeRetrospective({ workspaceRoot: WORKSPACE_ROOT, fs });

    expect(report.topRecurringFindings[0]).toMatchObject({
      count: 2,
      severity: 'error',
    });
    expect(report.topRecurringFindings[0]?.message).toContain('Coverage summary não encontrado');
  });

  it('generates recommendations from hot gates and recurring findings', async () => {
    const fs = new InMemoryFileSystem();

    await writeJson(fs, 'C:/workspace/.speckit/traceability/STORY-401.json', {
      specId: 'STORY-401',
      entries: [],
    });
    await writeJson(fs, 'C:/workspace/.speckit/traceability/STORY-402.json', {
      specId: 'STORY-402',
      entries: [],
    });
    await writeJson(fs, 'C:/workspace/.speckit/state/iteration-counters/STORY-401.json', {
      perGate: { '2': 4 },
      updatedAt: '2026-05-01T00:00:00.000Z',
    });
    await writeJson(fs, 'C:/workspace/.speckit/state/iteration-counters/STORY-402.json', {
      perGate: { '2': 3 },
      updatedAt: '2026-05-02T00:00:00.000Z',
    });
    await writeJson(fs, 'C:/workspace/.speckit/evidence/STORY-401-run-1.json', {
      specId: 'STORY-401',
      findings: [
        { message: 'Coverage summary não encontrado em coverage/story-401.json.', severity: 'error' },
      ],
    });
    await writeJson(fs, 'C:/workspace/.speckit/evidence/STORY-402-run-1.json', {
      specId: 'STORY-402',
      findings: [
        { message: 'Coverage summary não encontrado em coverage/story-402.json.', severity: 'error' },
      ],
    });

    const report = await analyzeRetrospective({ workspaceRoot: WORKSPACE_ROOT, fs });

    expect(report.recommendations.join('\n')).toContain('Gate 2 — Implementação está com média de 3.50 iterações');
    expect(report.recommendations.join('\n')).toContain('Cobertura/testes aparecem como padrão recorrente');
  });
});
