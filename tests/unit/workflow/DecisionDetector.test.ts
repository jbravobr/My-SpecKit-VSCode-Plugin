import { describe, expect, it } from 'vitest';

import type { Finding } from '../../../src/validator/auto/types';
import {
  detectAlternativeDiscarded,
  detectBreakingChange,
  detectGateRegression,
  detectModeSwitch,
} from '../../../src/workflow/DecisionDetector';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    validator: 'review-auto',
    severity: 'warn',
    message: 'Request changes and return to Gate 2.',
    suggestedFix: 'Return to Gate 2 for rework.',
    metadata: { specId: 'STORY-123' },
    ...overrides,
  };
}

describe('DecisionDetector', () => {
  it('detectAlternativeDiscarded returns decision input when findings are resolved', () => {
    const decision = detectAlternativeDiscarded([makeFinding()], [0]);

    expect(decision).toMatchObject({
      kind: 'alternative-discarded',
      specId: 'STORY-123',
    });
    expect(decision?.alternatives).toEqual(['Return to Gate 2 for rework.']);
  });

  it('detectGateRegression returns decision input on a -1 gate transition', () => {
    const decision = detectGateRegression(3, 2, 'STORY-123', 'Rework was requested.');

    expect(decision).toMatchObject({
      kind: 'gate-regression',
      specId: 'STORY-123',
      decision: 'Return STORY-123 to Gate 2 for rework before advancing again',
    });
    expect(decision?.consequences).toBe('Rework was requested.');
  });

  it('detectModeSwitch returns decision input when modes differ', () => {
    const decision = detectModeSwitch('implementador', 'revisor', 'STORY-123');

    expect(decision).toMatchObject({
      kind: 'mode-switch',
      specId: 'STORY-123',
      decision: 'Switch the active agent mode from implementador to revisor',
    });
  });

  it('detectBreakingChange returns decision input for conventional breaking commits', () => {
    const decision = detectBreakingChange('feat(api)!: remove legacy endpoint', 'STORY-123');

    expect(decision).toMatchObject({
      kind: 'breaking-change',
      specId: 'STORY-123',
    });
  });

  it('returns undefined when no decision pattern matches', () => {
    expect(detectAlternativeDiscarded([makeFinding()], [])).toBeUndefined();
    expect(detectGateRegression(2, 2, 'STORY-123')).toBeUndefined();
    expect(detectGateRegression(4, 2, 'STORY-123')).toBeUndefined();
    expect(detectModeSwitch('revisor', 'revisor', 'STORY-123')).toBeUndefined();
    expect(detectBreakingChange('feat(story-123): compatible update', 'STORY-123')).toBeUndefined();
  });
});
