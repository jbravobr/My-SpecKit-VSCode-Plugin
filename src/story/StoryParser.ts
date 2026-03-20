import { Story, emptyStory, Language, Framework, Architecture, Target } from './Story';

// --- Module-level static regexes (compiled once at load time) ---
const RE_BULLET       = /^-\s+\S/;
const RE_DOR_ITEM     = /^-\s+\[/;
const RE_DOR_CHECKED  = /\[x\]/i;
const RE_DOR_PREFIX   = /^-\s+\[.\]\s+/;
const RE_BULLET_PFX   = /^-\s+/;
const RE_TODO         = /<!--\s*TODO[^>]*-->/g;
const RE_HTML_COMMENT = /<!--.*?-->/gs;
const RE_META_BLOCK   = /<!--\s*metadata\s*([\s\S]*?)-->/;
const RE_SECTION_SPLIT = /^(###?\s+.+)$/m;

export function parseStory(markdown: string): Story {
  const story = emptyStory();

  const metaMatch = markdown.match(RE_META_BLOCK);
  if (metaMatch) {
    const fields = parseMetaFields(metaMatch[1]);
    story.metadata.id        = fields['id']        ?? '';
    story.metadata.title     = cleanTodo(fields['title']     ?? '');
    story.metadata.createdAt = fields['createdAt'] ?? '';
    story.metadata.version   = parseInt(fields['version'] ?? '1', 10);
  }

  const sectionMap = buildSectionMap(markdown);
  const get = (heading: string) => sectionMap.get(heading) ?? '';

  story.businessRequirement.problem      = cleanTodo(get('Problema'));
  story.businessRequirement.value        = cleanTodo(get('Valor'));
  story.businessRequirement.stakeholders = extractBulletList(get('Stakeholders'));

  story.functionalSpec.userStories          = extractBulletList(get('User Stories'));
  story.functionalSpec.acceptanceCriteria   = extractBulletList(get('Critérios de Aceite'));
  story.functionalSpec.outOfScope           = extractBulletList(get('Fora de Escopo'));

  story.nonFunctionalSpec.performance  = cleanTodo(get('Performance'));
  story.nonFunctionalSpec.security     = cleanTodo(get('Segurança'));
  story.nonFunctionalSpec.scalability  = cleanTodo(get('Escalabilidade'));
  story.nonFunctionalSpec.usability    = cleanTodo(get('Usabilidade'));
  story.nonFunctionalSpec.availability = cleanTodo(get('Disponibilidade'));

  story.technicalSpec.language       = cleanTodo(get('Linguagem'))     as Language | '';
  story.technicalSpec.framework      = cleanTodo(get('Framework'))     as Framework | '';
  story.technicalSpec.architecture   = cleanTodo(get('Arquitetura'))   as Architecture | '';
  story.technicalSpec.target         = cleanTodo(get('Target'))        as Target | '';
  story.technicalSpec.database       = cleanTodo(get('Banco de Dados'));
  story.technicalSpec.infrastructure = cleanTodo(get('Infraestrutura'));

  const dorItems = parseDorItems(get('DoR — Definition of Ready'));
  story.dor.criteria = dorItems.map(d => d.text);
  story.dor.checked  = dorItems.map(d => d.checked);

  story.dod.criteria = extractBulletList(get('DoD — Definition of Done'));

  return story;
}

/** Single-pass: splits markdown on heading lines, strips HTML comments once per block. */
function buildSectionMap(markdown: string): Map<string, string> {
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
    const headingMatch = /^###?\s+(.+)$/.exec(line);
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
function parseMetaFields(meta: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of meta.split('\n')) {
    const colon = line.indexOf(':');
    if (colon !== -1) {
      result[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return result;
}

function extractBulletList(section: string): string[] {
  return section
    .split('\n')
    .filter(line => RE_BULLET.test(line))
    .map(line => line.replace(RE_BULLET_PFX, '').trim())
    .filter(line => line.length > 0);
}

function parseDorItems(section: string): { text: string; checked: boolean }[] {
  return section
    .split('\n')
    .filter(line => RE_DOR_ITEM.test(line))
    .map(line => ({
      checked: RE_DOR_CHECKED.test(line),
      text: line.replace(RE_DOR_PREFIX, '').trim(),
    }));
}

function cleanTodo(value: string): string {
  if (!value) return '';
  return value.replace(RE_TODO, '').trim();
}
