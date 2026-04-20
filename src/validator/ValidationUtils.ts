export interface ValidationGap {
  section: string;
  field: string;
  message: string;
}

/** Pushes a gap if the value is falsy (empty string, undefined, null). */
export function checkRequired(
  gaps: ValidationGap[],
  value: unknown,
  section: string,
  field: string,
  message: string,
): void {
  if (!value) gaps.push({ section, field, message });
}

/** Pushes a gap if the array is empty or undefined. */
export function checkRequiredArray(
  gaps: ValidationGap[],
  arr: unknown[] | undefined,
  section: string,
  field: string,
  message: string,
): void {
  if (!arr || arr.length === 0) gaps.push({ section, field, message });
}

/** Pushes a gap if the value is falsy OR not in the valid set. */
export function checkEnum(
  gaps: ValidationGap[],
  value: unknown,
  validSet: Set<string>,
  section: string,
  field: string,
  message: string,
): void {
  if (!value || !validSet.has(String(value))) gaps.push({ section, field, message });
}
