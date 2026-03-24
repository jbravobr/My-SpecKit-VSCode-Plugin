export function isNa(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return v === '' || v === 'na' || v === 'n/a' || v === 'none' || v === 'nenhum';
}
