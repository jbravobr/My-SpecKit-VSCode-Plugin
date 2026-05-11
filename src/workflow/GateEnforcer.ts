// GateEnforcer — Validates gate and status transitions for SDD specs
//
// Gate advancement protocol:
//   Gate 0 (Alignment) → Gate 1 (Implementation) → Gate 2 (Tests)
//   → Gate 3 (Review) → Gate 4 (Delivery)
//
// Rules:
// - Gate advances by at most +1 at a time
// - Gate regresses by at most -1 at a time (rework)
// - Status transitions follow defined state machine

import type { Gate, SpecStatus } from '../story/Story';

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

const STATUS_TRANSITIONS: Record<SpecStatus, SpecStatus[]> = {
  open: ['in-progress', 'blocked', 'cancelled'],
  'in-progress': ['review', 'blocked', 'cancelled'],
  review: ['ready-to-commit', 'in-progress', 'blocked', 'cancelled'],
  blocked: ['in-progress', 'cancelled'],
  'ready-to-commit': ['done', 'in-progress', 'blocked', 'cancelled'],
  done: [],
  cancelled: [],
};

export function validateGateTransition(from: Gate, to: Gate): TransitionResult {
  if (from === to) return { allowed: false, reason: `Gate is already at ${from}` };
  const diff = to - from;
  if (diff === 1) return { allowed: true };
  if (diff === -1) return { allowed: true, reason: 'Rework: gate regressed by 1' };
  if (diff > 1)
    return { allowed: false, reason: `Cannot skip gates: ${from} → ${to} (max advance is +1)` };
  return {
    allowed: false,
    reason: `Cannot regress more than 1 gate: ${from} → ${to} (max regress is -1)`,
  };
}

export function validateStatusTransition(from: SpecStatus, to: SpecStatus): TransitionResult {
  if (from === to) return { allowed: false, reason: `Status is already '${from}'` };
  const allowed = STATUS_TRANSITIONS[from];
  if (!allowed || allowed.length === 0)
    return { allowed: false, reason: `Cannot transition from terminal status '${from}'` };
  if (allowed.includes(to)) return { allowed: true };
  return {
    allowed: false,
    reason: `Invalid transition: '${from}' → '${to}'. Allowed: ${allowed.join(', ')}`,
  };
}

export function getValidNextStatuses(current: SpecStatus): SpecStatus[] {
  return STATUS_TRANSITIONS[current] ?? [];
}

export function getValidNextGates(current: Gate): Gate[] {
  const result: Gate[] = [];
  if (current < 4) result.push((current + 1) as Gate);
  if (current > 0) result.push((current - 1) as Gate);
  return result;
}
