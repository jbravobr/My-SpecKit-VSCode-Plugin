import { Story, emptyStory, Language, Framework, Architecture, Target, SpecStatus } from './Story';
import {
  buildSectionMap,
  parseMetaFields,
  extractBulletList,
  parseDorItems,
  cleanTodo,
  RE_META_BLOCK,
} from '../parser/BaseParser';

export function parseStory(markdown: string): Story {
  const story = emptyStory();

  const metaMatch = markdown.match(RE_META_BLOCK);
  if (metaMatch) {
    const fields = parseMetaFields(metaMatch[1]);
    story.metadata.id        = fields['id']        ?? '';
    story.metadata.title     = cleanTodo(fields['title']     ?? '');
    story.metadata.createdAt = fields['createdAt'] ?? '';
    story.metadata.version   = parseInt(fields['version'] ?? '1', 10);
    story.metadata.type      = 'story';
    story.metadata.status    = (fields['status'] as SpecStatus) === 'done' ? 'done' : 'open';
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

  const dorItems = parseDorItems(get('DoR - Definition of Ready'));
  story.dor.criteria = dorItems.map(d => d.text);
  story.dor.checked  = dorItems.map(d => d.checked);

  story.dod.criteria = extractBulletList(get('DoD - Definition of Done'));

  return story;
}

