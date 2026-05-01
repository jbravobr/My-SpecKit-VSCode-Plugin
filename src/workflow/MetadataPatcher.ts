// Shared upsert utility for the `<!-- metadata ... -->` block found in
// Story and Fix markdown files. Used by /review-auto and /status --fix.

import { RE_META_BLOCK } from '../parser/BaseParser';

export interface MetadataPatchResult {
  content: string;
  changed: boolean;
}

/**
 * Upsert one or more `key: value` pairs inside the metadata HTML comment block.
 *
 * - Existing keys are replaced in place (case-insensitive match on key).
 * - Missing keys are appended at the end of the metadata block.
 * - Throws if the metadata block is missing.
 */
export function upsertMetadataFields(
  content: string,
  fields: Record<string, string | number>,
): MetadataPatchResult {
  const metaMatch = content.match(RE_META_BLOCK);
  if (!metaMatch || metaMatch.index === undefined) {
    throw new Error('Bloco <!-- metadata --> não encontrado.');
  }

  const before = content.slice(0, metaMatch.index);
  const after = content.slice(metaMatch.index + metaMatch[0].length);
  const lines = metaMatch[1].replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  const remaining = new Map<string, string>(
    Object.entries(fields).map(([k, v]) => [k.toLowerCase(), String(v)]),
  );

  const nextLines = lines.map((line) => {
    const colon = line.indexOf(':');
    if (colon === -1) return line;
    const key = line.slice(0, colon).trim().toLowerCase();
    if (remaining.has(key)) {
      const value = remaining.get(key)!;
      remaining.delete(key);
      return `${line.slice(0, colon).trim()}: ${value}`;
    }
    return line;
  });

  for (const [key, value] of remaining) {
    nextLines.push(`${key}: ${value}`);
  }

  const normalizedLines = nextLines
    .join('\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(
      (line, idx, arr) =>
        !(idx === 0 && line.trim().length === 0) &&
        !(idx === arr.length - 1 && line.trim().length === 0),
    );

  const replacement = `<!-- metadata\n${normalizedLines.join('\n')}\n-->`;
  const nextContent = `${before}${replacement}${after}`;

  return { content: nextContent, changed: nextContent !== content };
}
