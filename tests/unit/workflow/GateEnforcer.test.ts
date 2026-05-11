import { describe, expect, it } from 'vitest';

import type { Gate, SpecStatus } from '../../../src/story/Story';
import {
  getValidNextGates,
  getValidNextStatuses,
  validateGateTransition,
  validateStatusTransition,
} from '../../../src/workflow/GateEnforcer';

describe('GateEnforcer', () => {
  describe('validateGateTransition', () => {
    it('allows single gate advance (+1)', () => {
      for (const from of [0, 1, 2, 3] as Gate[]) {
        const to = (from + 1) as Gate;
        const result = validateGateTransition(from, to);
        expect(result.allowed).toBe(true);
      }
    });

    it('allows single gate regress (-1) with rework reason', () => {
      for (const from of [1, 2, 3, 4] as Gate[]) {
        const to = (from - 1) as Gate;
        const result = validateGateTransition(from, to);
        expect(result.allowed).toBe(true);
        expect(result.reason).toContain('Rework');
      }
    });

    it('rejects same gate transition', () => {
      const result = validateGateTransition(2, 2);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('already at');
    });

    it('rejects skip of 2+ gates forward', () => {
      const result = validateGateTransition(0, 2);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cannot skip');
    });

    it('rejects regress of 2+ gates backward', () => {
      const result = validateGateTransition(4, 2);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cannot regress more');
    });

    it('rejects skip from Gate 0 to Gate 4', () => {
      const result = validateGateTransition(0, 4);
      expect(result.allowed).toBe(false);
    });
  });

  describe('validateStatusTransition', () => {
    it('allows open → in-progress', () => {
      expect(validateStatusTransition('open', 'in-progress').allowed).toBe(true);
    });

    it('allows in-progress → review', () => {
      expect(validateStatusTransition('in-progress', 'review').allowed).toBe(true);
    });

    it('allows review → ready-to-commit', () => {
      expect(validateStatusTransition('review', 'ready-to-commit').allowed).toBe(true);
    });

    it('allows ready-to-commit → done', () => {
      expect(validateStatusTransition('ready-to-commit', 'done').allowed).toBe(true);
    });

    it('allows review → in-progress (rework)', () => {
      expect(validateStatusTransition('review', 'in-progress').allowed).toBe(true);
    });

    it('allows blocked → in-progress (unblock)', () => {
      expect(validateStatusTransition('blocked', 'in-progress').allowed).toBe(true);
    });

    it('allows any active status → blocked', () => {
      for (const from of ['open', 'in-progress', 'review', 'ready-to-commit'] as SpecStatus[]) {
        expect(validateStatusTransition(from, 'blocked').allowed).toBe(true);
      }
    });

    it('allows any active status → cancelled', () => {
      for (const from of [
        'open',
        'in-progress',
        'review',
        'blocked',
        'ready-to-commit',
      ] as SpecStatus[]) {
        expect(validateStatusTransition(from, 'cancelled').allowed).toBe(true);
      }
    });

    it('rejects transition from terminal "done"', () => {
      const result = validateStatusTransition('done', 'open');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('terminal');
    });

    it('rejects transition from terminal "cancelled"', () => {
      const result = validateStatusTransition('cancelled', 'open');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('terminal');
    });

    it('rejects same status', () => {
      const result = validateStatusTransition('open', 'open');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('already');
    });

    it('rejects invalid transition open → review (skip in-progress)', () => {
      const result = validateStatusTransition('open', 'review');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid transition');
    });

    it('rejects invalid transition open → done (skip in-progress + review)', () => {
      const result = validateStatusTransition('open', 'done');
      expect(result.allowed).toBe(false);
    });
  });

  describe('getValidNextStatuses', () => {
    it('returns correct options for open', () => {
      expect(getValidNextStatuses('open')).toEqual(['in-progress', 'blocked', 'cancelled']);
    });

    it('returns empty array for done', () => {
      expect(getValidNextStatuses('done')).toEqual([]);
    });

    it('returns empty array for cancelled', () => {
      expect(getValidNextStatuses('cancelled')).toEqual([]);
    });
  });

  describe('getValidNextGates', () => {
    it('returns [1] for Gate 0', () => {
      expect(getValidNextGates(0)).toEqual([1]);
    });

    it('returns [3] for Gate 4', () => {
      expect(getValidNextGates(4)).toEqual([3]);
    });

    it('returns [advance, regress] for middle gates', () => {
      expect(getValidNextGates(2)).toEqual([3, 1]);
    });
  });
});
