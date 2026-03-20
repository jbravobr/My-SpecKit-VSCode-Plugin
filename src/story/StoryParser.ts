import { Story, emptyStory, Language, Framework, Architecture, Target } from './Story';

export function parseStory(markdown: string): Story {
  const story = emptyStory();

  const metaMatch = markdown.match(/<!--\s*metadata\s*([\s\S]*?)-->/);
  if (metaMatch) {
    const meta = metaMatch[1];
    story.metadata.id = extractMetaField(meta, 'id');
    story.metadata.title = cleanTodo(extractMetaField(meta, 'title'));
    story.metadata.createdAt = extractMetaField(meta, 'createdAt');
    story.metadata.version = parseInt(extractMetaField(meta, 'version') || '1', 10);
  }

  story.businessRequirement.problem = cleanTodo(extractSection(markdown, 'Problema'));
  story.businessRequirement.value = cleanTodo(extractSection(markdown, 'Valor'));
  story.businessRequirement.stakeholders = extractBulletList(extractSection(markdown, 'Stakeholders'));

  story.functionalSpec.userStories = extractBulletList(extractSection(markdown, 'User Stories'));
  story.functionalSpec.acceptanceCriteria = extractBulletList(extractSection(markdown, 'Critérios de Aceite'));
  story.functionalSpec.outOfScope = extractBulletList(extractSection(markdown, 'Fora de Escopo'));

  story.nonFunctionalSpec.performance = cleanTodo(extractSection(markdown, 'Performance'));
  story.nonFunctionalSpec.security = cleanTodo(extractSection(markdown, 'Segurança'));
  story.nonFunctionalSpec.scalability = cleanTodo(extractSection(markdown, 'Escalabilidade'));
  story.nonFunctionalSpec.usability = cleanTodo(extractSection(markdown, 'Usabilidade'));
  story.nonFunctionalSpec.availability = cleanTodo(extractSection(markdown, 'Disponibilidade'));

  story.technicalSpec.language = cleanTodo(extractSection(markdown, 'Linguagem')) as Language | '';
  story.technicalSpec.framework = cleanTodo(extractSection(markdown, 'Framework')) as Framework | '';
  story.technicalSpec.architecture = cleanTodo(extractSection(markdown, 'Arquitetura')) as Architecture | '';
  story.technicalSpec.target = cleanTodo(extractSection(markdown, 'Target')) as Target | '';
  story.technicalSpec.database = cleanTodo(extractSection(markdown, 'Banco de Dados'));
  story.technicalSpec.infrastructure = cleanTodo(extractSection(markdown, 'Infraestrutura'));

  const dorSection = extractSection(markdown, 'DoR — Definition of Ready');
  const dorItems = parseDorItems(dorSection);
  story.dor.criteria = dorItems.map(d => d.text);
  story.dor.checked = dorItems.map(d => d.checked);

  story.dod.criteria = extractBulletList(extractSection(markdown, 'DoD — Definition of Done'));

  return story;
}

function extractMetaField(meta: string, field: string): string {
  const match = meta.match(new RegExp(`${field}:\\s*(.+)`));
  return match ? match[1].trim() : '';
}

function extractSection(markdown: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`###?\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n###?\\s|\\n---\\s*\\n|$)`);
  const match = markdown.match(pattern);
  if (!match) return '';
  return match[1].replace(/<!--.*?-->/gs, '').trim();
}

function extractBulletList(section: string): string[] {
  return section
    .split('\n')
    .filter(line => /^-\s+\S/.test(line))
    .map(line => line.replace(/^-\s+/, '').trim())
    .filter(line => line.length > 0);
}

function parseDorItems(section: string): { text: string; checked: boolean }[] {
  return section
    .split('\n')
    .filter(line => /^-\s+\[/.test(line))
    .map(line => {
      const checked = /\[x\]/i.test(line);
      const text = line.replace(/^-\s+\[.\]\s+/, '').trim();
      return { text, checked };
    });
}

function cleanTodo(value: string): string {
  if (!value) return '';
  return value.replace(/<!--\s*TODO[^>]*-->/g, '').trim();
}
