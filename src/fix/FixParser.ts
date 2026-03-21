import { Fix, FixMetadata, Severity } from './Fix';
import { SpecStatus } from '../story/Story';

// --- Static regexes ---
const RE_BULLET       = /^-\s+\S/;
const RE_DOR_ITEM     = /^-\s+\[/;
const RE_DOR_PREFIX   = /^-\s+\[.\]\s+/;
const RE_BULLET_PFX   = /^-\s+/;
const RE_TODO         = /<!--\s*TODO[^>]*-->/g;
const RE_HTML_COMMENT = /<!--.*?-->/gs;
const RE_META_BLOCK   = /<!--\s*metadata\s*([\s\S]*?)-->/;

export function parseFix(markdown: string): Fix {
  const metadata = parseMetadata(markdown);
  const sectionMap = buildSectionMap(markdown);
  const get = (heading: string) => sectionMap.get(heading) ?? '';

  return {
    metadata,
    bugDescription: {
      title: cleanTodo(get('Título do Bug')),
      symptoms: cleanTodo(get('Sintomas')),
      stepsToReproduce: extractBulletList(get('Passos para Reproduzir')),
      environment: cleanTodo(get('Ambiente Afetado')),
      frequency: cleanTodo(get('Frequência de Ocorrência')),
    },
    rootCauseHypothesis: {
      hypothesis: cleanTodo(get('Hipótese')),
      suspectedFiles: extractBulletList(get('Arquivos/Componentes Suspeitos')),
      suspectedComponents: [],
    },
    impactAssessment: {
      severity: cleanTodo(get('Severidade')) as Severity | '',
      affectedUsers: cleanTodo(get('Usuários/Sistemas Afetados')),
      affectedSystems: [],
      regressionRisk: cleanTodo(get('Risco de Regressão')),
    },
    regressionPrevention: {
      testsToAdd: extractBulletList(get('Testes a Adicionar')),
    },
    dof: {
      criteria: parseDofItems(get('DoF — Definition of Fixed')),
    },
  };
}

function parseMetadata(markdown: string): FixMetadata {
  const metaMatch = markdown.match(RE_META_BLOCK);
  const fields = metaMatch ? parseMetaFields(metaMatch[1]) : {};
  return {
    id: fields['id'] ?? '',
    title: cleanTodo(fields['title'] ?? ''),
    createdAt: fields['createdAt'] ?? '',
    version: parseInt(fields['version'] ?? '1', 10),
    type: 'fix',
    status: (fields['status'] as SpecStatus) === 'done' ? 'done' : 'open',
  };
}

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

function parseDofItems(section: string): string[] {
  return section
    .split('\n')
    .filter(line => RE_DOR_ITEM.test(line))
    .map(line => line.replace(RE_DOR_PREFIX, '').trim())
    .filter(line => line.length > 0);
}

function cleanTodo(value: string): string {
  if (!value) return '';
  return value.replace(RE_TODO, '').trim();
}
