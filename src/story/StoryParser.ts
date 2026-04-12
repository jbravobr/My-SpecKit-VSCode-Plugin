import {
  buildSectionMap,
  cleanTodo,
  extractBulletList,
  parseDorItems,
  parseMetaFields,
  RE_META_BLOCK,
} from '../parser/BaseParser';
import {
  Architecture,
  emptyStory,
  Framework,
  Gate,
  Language,
  ProjectStage,
  SpecStatus,
  SpecType,
  Story,
  Target,
} from './Story';

export function parseStory(markdown: string): Story {
  const story = emptyStory();

  const metaMatch = markdown.match(RE_META_BLOCK);
  if (metaMatch) {
    const fields = parseMetaFields(metaMatch[1]);
    story.metadata.id = fields['id'] ?? '';
    story.metadata.title = cleanTodo(fields['title'] ?? '');
    story.metadata.createdAt = fields['createdAt'] ?? '';
    story.metadata.version = parseInt(fields['version'] ?? '1', 10);
    story.metadata.type = parseSpecType(fields['type']);
    story.metadata.status = parseSpecStatus(fields['status']);
    story.metadata.gate = parseGate(fields['gate']);
  }

  const sectionMap = buildSectionMap(markdown);
  const get = (heading: string) => sectionMap.get(heading) ?? '';

  story.businessRequirement.problem = cleanTodo(get('Problema'));
  story.businessRequirement.value = cleanTodo(get('Valor'));
  story.businessRequirement.stakeholders = extractBulletList(get('Stakeholders'));

  story.functionalSpec.userStories = extractBulletList(get('User Stories'));
  story.functionalSpec.acceptanceCriteria = extractBulletList(get('Critérios de Aceite'));
  story.functionalSpec.outOfScope = extractBulletList(get('Fora de Escopo'));

  story.nonFunctionalSpec.performance = cleanTodo(get('Performance'));
  story.nonFunctionalSpec.security = cleanTodo(get('Segurança'));
  story.nonFunctionalSpec.scalability = cleanTodo(get('Escalabilidade'));
  story.nonFunctionalSpec.usability = cleanTodo(get('Usabilidade'));
  story.nonFunctionalSpec.availability = cleanTodo(get('Disponibilidade'));

  story.technicalSpec.language = cleanTodo(get('Linguagem')) as Language | '';
  story.technicalSpec.framework = cleanTodo(get('Framework')) as Framework | '';
  story.technicalSpec.architecture = cleanTodo(get('Arquitetura')) as Architecture | '';
  story.technicalSpec.target = cleanTodo(get('Target')) as Target | '';
  story.technicalSpec.database = cleanTodo(get('Banco de Dados'));
  story.technicalSpec.infrastructure = cleanTodo(get('Infraestrutura'));
  story.technicalSpec.projectStage = cleanTodo(get('Estágio do Projeto')) as ProjectStage | '';

  const dorItems = parseDorItems(get('DoR - Definition of Ready'));
  story.dor.criteria = dorItems.map((d) => d.text);
  story.dor.checked = dorItems.map((d) => d.checked);

  story.dod.criteria = extractBulletList(get('DoD - Definition of Done'));

  return story;
}

const VALID_STATUSES = new Set<SpecStatus>([
  'open',
  'in-progress',
  'review',
  'blocked',
  'done',
  'cancelled',
]);
const VALID_TYPES = new Set<SpecType>(['story', 'refactoring', 'spike']);

function parseSpecStatus(raw: string | undefined): SpecStatus {
  const v = raw?.trim() as SpecStatus;
  return VALID_STATUSES.has(v) ? v : 'open';
}

function parseSpecType(raw: string | undefined): SpecType {
  const v = raw?.trim() as SpecType;
  return VALID_TYPES.has(v) ? v : 'story';
}

function parseGate(raw: string | undefined): Gate {
  const n = parseInt(raw ?? '0', 10);
  return (n >= 0 && n <= 4 ? n : 0) as Gate;
}
