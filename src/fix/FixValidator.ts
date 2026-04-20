import { checkEnum, checkRequired, checkRequiredArray } from '../validator/ValidationUtils';
import { Fix, FixGap, FixValidationResult } from './Fix';

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

export function validateFix(fix: Fix): FixValidationResult {
  const gaps: FixGap[] = [];

  checkRequired(
    gaps,
    fix.bugDescription.title,
    'Bug Description',
    'title',
    'Título do bug é obrigatório',
  );
  checkRequired(
    gaps,
    fix.bugDescription.symptoms,
    'Bug Description',
    'symptoms',
    'Descrição dos sintomas é obrigatória',
  );
  checkRequiredArray(
    gaps,
    fix.bugDescription.stepsToReproduce,
    'Bug Description',
    'stepsToReproduce',
    'Ao menos um passo para reproduzir é obrigatório',
  );
  checkRequired(
    gaps,
    fix.rootCauseHypothesis.hypothesis,
    'Root Cause Hypothesis',
    'hypothesis',
    'Hipótese da causa raiz é obrigatória',
  );
  checkEnum(
    gaps,
    fix.impactAssessment.severity,
    VALID_SEVERITIES,
    'Impact Assessment',
    'severity',
    'Severidade deve ser: critical | high | medium | low',
  );
  checkRequiredArray(
    gaps,
    fix.dof.criteria,
    'DoF',
    'criteria',
    'Ao menos um critério de DoF é obrigatório',
  );

  return { valid: gaps.length === 0, gaps };
}
