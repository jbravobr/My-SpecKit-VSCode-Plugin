import type { Finding } from '../validator/auto/types';

import type { DecisionInput } from './DecisionRecorder';

export function detectAlternativeDiscarded(
  findings: Finding[],
  resolvedIndices: number[],
): DecisionInput | undefined {
  const resolved = uniqueResolvedFindings(findings, resolvedIndices);
  if (resolved.length === 0) return undefined;

  const specId = resolved.map(extractSpecId).find((value): value is string => Boolean(value));
  if (!specId) return undefined;

  const alternatives = resolved
    .map((finding) => normalizeInline(finding.suggestedFix ?? finding.message))
    .filter((value) => value.length > 0);
  if (alternatives.length === 0) return undefined;

  return {
    kind: 'alternative-discarded',
    specId,
    context: `Automatic review resolved ${resolved.length} finding(s) for ${specId}.`,
    decision:
      resolved.length === 1
        ? 'Discard the previously considered review alternative after resolving the finding'
        : `Discard ${resolved.length} previously considered review alternatives after resolving the findings`,
    alternatives,
    consequences: 'The accepted remediation path becomes the new baseline for subsequent work.',
  };
}

export function detectGateRegression(
  fromGate: number,
  toGate: number,
  specId: string,
  reason?: string,
): DecisionInput | undefined {
  if (!Number.isInteger(fromGate) || !Number.isInteger(toGate) || !normalizeInline(specId)) {
    return undefined;
  }
  if (fromGate - toGate !== 1) return undefined;

  return {
    kind: 'gate-regression',
    specId: normalizeInline(specId),
    context: `Validation observed ${specId} move from Gate ${fromGate} to Gate ${toGate}.`,
    decision: `Return ${specId} to Gate ${toGate} for rework before advancing again`,
    alternatives: [`Remain in Gate ${fromGate} without rework`],
    consequences:
      normalizeInline(reason) ||
      'Previously accepted work must be revisited and revalidated before promotion.',
  };
}

export function detectModeSwitch(
  fromMode: string,
  toMode: string,
  specId: string,
): DecisionInput | undefined {
  const normalizedFrom = normalizeInline(fromMode);
  const normalizedTo = normalizeInline(toMode);
  const normalizedSpecId = normalizeInline(specId);
  if (!normalizedFrom || !normalizedTo || !normalizedSpecId) return undefined;
  if (normalizedFrom.toLowerCase() === normalizedTo.toLowerCase()) return undefined;

  return {
    kind: 'mode-switch',
    specId: normalizedSpecId,
    context: `The active agent mode for ${normalizedSpecId} changed during command execution.`,
    decision: `Switch the active agent mode from ${normalizedFrom} to ${normalizedTo}`,
    alternatives: [normalizedFrom],
    consequences: `Subsequent prompts and guardrails should follow the ${normalizedTo} mode.`,
  };
}

export function detectBreakingChange(
  commitMessage: string,
  specId: string,
): DecisionInput | undefined {
  const normalizedMessage = normalizeInline(commitMessage);
  const normalizedSpecId = normalizeInline(specId);
  if (!normalizedMessage || !normalizedSpecId) return undefined;

  const withoutPrefix = normalizedMessage.replace(/^speckit:\s*/i, '');
  const conventionalBreaking = /^[a-z]+(?:\([^)]+\))?!:/i.test(withoutPrefix);
  const footerBreaking = /BREAKING(?:[ -])CHANGE\s*:/i.test(commitMessage);
  if (!conventionalBreaking && !footerBreaking) return undefined;

  return {
    kind: 'breaking-change',
    specId: normalizedSpecId,
    context: `A commit for ${normalizedSpecId} carries breaking-change semantics.`,
    decision: `Accept a breaking change in the commit for ${normalizedSpecId}`,
    alternatives: ['Ship a backwards-compatible change instead'],
    consequences: 'Consumers may need coordinated rollout, migration, or version updates.',
  };
}

function uniqueResolvedFindings(findings: Finding[], resolvedIndices: number[]): Finding[] {
  const uniqueIndices = [...new Set(resolvedIndices)].filter(
    (index) => Number.isInteger(index) && index >= 0 && index < findings.length,
  );
  return uniqueIndices.map((index) => findings[index]!);
}

function extractSpecId(finding: Finding): string | undefined {
  const metadata = finding.metadata;
  if (!metadata || typeof metadata !== 'object') return undefined;
  const specId = Reflect.get(metadata, 'specId');
  return typeof specId === 'string' ? normalizeInline(specId) : undefined;
}

function normalizeInline(value: string | undefined): string {
  return (value ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}
