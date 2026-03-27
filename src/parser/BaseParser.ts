// Shared parsing utilities for StoryParser and FixParser

// --- Module-level static regexes (compiled once at load time) ---
export const RE_BULLET       = /^-\s+\S/;
export const RE_DOR_ITEM     = /^-\s+\[/;
export const RE_DOR_CHECKED  = /\[x\]/i;
export const RE_DOR_PREFIX   = /^-\s+\[.\]\s+/;
export const RE_BULLET_PFX   = /^-\s+/;
export const RE_TODO         = /<!--\s*TODO[^>]*-->/g;
export const RE_HTML_COMMENT = /<!--.*?-->/gs;
export const RE_META_BLOCK   = /<!--\s*metadata\s*([\s\S]*?)-->/;

/** Single-pass: splits markdown on heading lines, strips HTML comments once per block. */
export function buildSectionMap(markdown: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = markdown.split('\n');
  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentHeading !== null) {
      map.set(currentHeading, buffer.join('\n').replace(RE_HTML_COMMENT, '').trim());
    }
  };

  for (const line of lines) {
    const headingMatch = /^#{2,4}\s+(.+)$/.exec(line);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      buffer = [];
    } else if (line.trim() === '---') {
      flush();
      currentHeading = null;
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  flush();

  return map;
}

/** Parses all `key: value` pairs from a metadata block in one pass. */
export function parseMetaFields(meta: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of meta.split('\n')) {
    const colon = line.indexOf(':');
    if (colon !== -1) {
      result[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return result;
}

export function extractBulletList(section: string): string[] {
  return section
    .split('\n')
    .filter(line => RE_BULLET.test(line))
    .map(line => line.replace(RE_BULLET_PFX, '').trim())
    .filter(line => line.length > 0);
}

/** Parses DoR-style checkbox items preserving checked state (Story). */
export function parseDorItems(section: string): { text: string; checked: boolean }[] {
  return section
    .split('\n')
    .filter(line => RE_DOR_ITEM.test(line))
    .map(line => ({
      checked: RE_DOR_CHECKED.test(line),
      text: line.replace(RE_DOR_PREFIX, '').trim(),
    }));
}

/** Parses DoF-style checkbox items returning only text (Fix). */
export function parseDofItems(section: string): string[] {
  return section
    .split('\n')
    .filter(line => RE_DOR_ITEM.test(line))
    .map(line => line.replace(RE_DOR_PREFIX, '').trim())
    .filter(line => line.length > 0);
}

export function cleanTodo(value: string): string {
  if (!value) return '';
  return value.replace(RE_TODO, '').trim();
}
