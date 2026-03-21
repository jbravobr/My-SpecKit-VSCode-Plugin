import { Fix, FixGap, FixValidationResult } from './Fix';

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

export function validateFix(fix: Fix): FixValidationResult {
  const gaps: FixGap[] = [];

  const gap = (section: string, field: string, message: string) =>
    gaps.push({ section, field, message });

  if (!fix.bugDescription.title) {
    gap('Bug Description', 'title', 'Título do bug é obrigatório');
  }

  if (!fix.bugDescription.symptoms) {
    gap('Bug Description', 'symptoms', 'Descrição dos sintomas é obrigatória');
  }

  if (fix.bugDescription.stepsToReproduce.length === 0) {
    gap('Bug Description', 'stepsToReproduce', 'Ao menos um passo para reproduzir é obrigatório');
  }

  if (!fix.rootCauseHypothesis.hypothesis) {
    gap('Root Cause Hypothesis', 'hypothesis', 'Hipótese da causa raiz é obrigatória');
  }

  if (!fix.impactAssessment.severity || !VALID_SEVERITIES.has(fix.impactAssessment.severity)) {
    gap(
      'Impact Assessment',
      'severity',
      'Severidade deve ser: critical | high | medium | low',
    );
  }

  if (fix.dof.criteria.length === 0) {
    gap('DoF', 'criteria', 'Ao menos um critério de DoF é obrigatório');
  }

  return { valid: gaps.length === 0, gaps };
}
