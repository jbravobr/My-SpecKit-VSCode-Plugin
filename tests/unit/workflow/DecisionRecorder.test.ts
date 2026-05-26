import { describe, expect, it } from 'vitest';

import { recordDecision, type DecisionInput } from '../../../src/workflow/DecisionRecorder';
import { InMemoryFileSystem } from '../../support/fakes';

class TrackingFileSystem extends InMemoryFileSystem {
  readonly ensuredDirs: string[] = [];

  override async ensureDir(dir: string): Promise<void> {
    this.ensuredDirs.push(dir);
  }
}

function makeDecision(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    kind: 'mode-switch',
    specId: 'STORY-001',
    context: 'The team confirmed a new execution strategy.',
    decision: 'Switch the active agent mode from implementador to revisor.',
    alternatives: ['Keep implementador active for the full flow'],
    consequences: 'Subsequent guidance will follow the review protocol.',
    ...overrides,
  };
}

describe('DecisionRecorder', () => {
  it('writes ADR file with the expected markdown format', async () => {
    const fs = new TrackingFileSystem();

    const adrPath = await recordDecision({
      workspaceRoot: 'C:/workspace',
      fs,
      decision: makeDecision(),
    });

    expect(adrPath).toMatch(/ADR-0001-switch-the-active-agent-mode-from-implementador-to\.md$/);
    const content = fs.contentFor(adrPath ?? 'ADR-0001');
    expect(content).toContain('# ADR-0001: Switch the active agent mode from implementador to revisor');
    expect(content).toContain('- **Status:** accepted');
    expect(content).toContain('- **Spec:** STORY-001');
    expect(content).toContain('- **Context:** The team confirmed a new execution strategy.');
    expect(content).toContain('- **Decision:** Switch the active agent mode from implementador to revisor.');
    expect(content).toContain(
      '- **Alternatives considered:** Keep implementador active for the full flow',
    );
    expect(content).toContain(
      '- **Consequences:** Subsequent guidance will follow the review protocol.',
    );
    expect(content).toMatch(/- \*\*Date:\*\* \d{4}-\d{2}-\d{2}/);
  });

  it('auto-increments the ADR number from existing files', async () => {
    const fs = new TrackingFileSystem();
    await fs.writeFile(
      'C:/workspace/.speckit/decisions/ADR-0007-existing-decision.md',
      '# existing',
    );

    const adrPath = await recordDecision({
      workspaceRoot: 'C:/workspace',
      fs,
      decision: makeDecision({ decision: 'Accept a new gate policy.' }),
    });

    expect(adrPath).toContain('ADR-0008-accept-a-new-gate-policy.md');
  });

  it('creates the decisions directory when missing', async () => {
    const fs = new TrackingFileSystem();

    await recordDecision({
      workspaceRoot: 'C:/workspace',
      fs,
      decision: makeDecision(),
    });

    expect(fs.ensuredDirs.map((dir) => dir.replace(/\\/g, '/'))).toContain(
      'C:/workspace/.speckit/decisions',
    );
  });

  it('returns undefined when required decision fields are blank', async () => {
    const fs = new TrackingFileSystem();

    const adrPath = await recordDecision({
      workspaceRoot: 'C:/workspace',
      fs,
      decision: makeDecision({ specId: '   ', decision: '   ' }),
    });

    expect(adrPath).toBeUndefined();
    expect(fs.writtenPaths()).toHaveLength(0);
  });

  it('handles concurrent writes safely', async () => {
    const fs = new TrackingFileSystem();

    const paths = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        recordDecision({
          workspaceRoot: 'C:/workspace',
          fs,
          decision: makeDecision({
            specId: `STORY-00${index + 1}`,
            decision: `Record decision number ${index + 1}.`,
          }),
        }),
      ),
    );

    const normalized = paths.map((entry) => entry?.replace(/\\/g, '/'));
    expect(normalized).toEqual([
      'C:/workspace/.speckit/decisions/ADR-0001-record-decision-number-1.md',
      'C:/workspace/.speckit/decisions/ADR-0002-record-decision-number-2.md',
      'C:/workspace/.speckit/decisions/ADR-0003-record-decision-number-3.md',
      'C:/workspace/.speckit/decisions/ADR-0004-record-decision-number-4.md',
    ]);
    expect(
      fs
        .writtenPaths()
        .filter((entry) => entry.includes('.speckit/decisions/'))
        .sort(),
    ).toHaveLength(4);
  });
});
