import * as path from 'path';

/**
 * Generates timestamp-based spec IDs with anti-collision detection.
 * Format: US-{AAA}-{YYYYMMDD}-{HHMM} (stories) / FIX-{AAA}-{YYYYMMDD}-{HHMM} (fixes)
 * AAA = workspace directory name, normalized: uppercase, alphanumeric, max 10 chars.
 */

const MAX_COLLISION_ATTEMPTS = 60;

/** Normalize directory name to uppercase alphanumeric, max 10 chars. */
export function normalizeAAA(workspaceRoot: string): string {
  const dirName = path.basename(workspaceRoot);
  return dirName
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 10);
}

function formatTimestamp(date: Date): string {
  const yyyy = date.getFullYear().toString();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

function resolveCollision(prefix: string, aaa: string, existingFiles: string[], now: Date): string {
  const existingSet = new Set(existingFiles.map((f) => f.replace(/\.md$/i, '')));
  for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt++) {
    const candidate = new Date(now.getTime() + attempt * 60_000);
    const id = `${prefix}-${aaa}-${formatTimestamp(candidate)}`;
    if (!existingSet.has(id)) return id;
  }
  throw new Error(
    `Não foi possível gerar um ID único após ${MAX_COLLISION_ATTEMPTS} tentativas. Tente novamente em alguns minutos.`,
  );
}

/** Generate a Story ID: US-{AAA}-{YYYYMMDD}-{HHMM} with anti-collision. */
export function generateStoryId(
  workspaceRoot: string,
  existingFiles: string[],
  now: Date = new Date(),
): string {
  const aaa = normalizeAAA(workspaceRoot);
  return resolveCollision('US', aaa, existingFiles, now);
}

/** Generate a Fix ID: FIX-{AAA}-{YYYYMMDD}-{HHMM} with anti-collision. */
export function generateFixId(
  workspaceRoot: string,
  existingFiles: string[],
  now: Date = new Date(),
): string {
  const aaa = normalizeAAA(workspaceRoot);
  return resolveCollision('FIX', aaa, existingFiles, now);
}
