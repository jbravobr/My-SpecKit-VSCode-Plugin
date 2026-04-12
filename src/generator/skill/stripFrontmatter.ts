/**
 * Strips YAML frontmatter (--- ... ---) from a generator's output.
 * Returns only the markdown content body.
 */
export function stripFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\s*/, '');
}
