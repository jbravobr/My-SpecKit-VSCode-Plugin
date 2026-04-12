import {
  buildSectionMap,
  cleanTodo,
  extractBulletList,
  parseDofItems,
  parseMetaFields,
  RE_META_BLOCK,
} from '../parser/BaseParser';
import { Gate, SpecStatus } from '../story/Story';
import { Fix, FixMetadata, Severity } from './Fix';

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
    technicalContext: {
      messaging: cleanTodo(get('Messaging')),
      database: cleanTodo(get('Banco de Dados / Cloud')),
    },
    dof: {
      criteria: parseDofItems(get('DoF - Definition of Fixed')),
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
    status: parseFixStatus(fields['status']),
    gate: parseGate(fields['gate']),
  };
}

const VALID_STATUSES = new Set<SpecStatus>([
  'open',
  'in-progress',
  'review',
  'blocked',
  'done',
  'cancelled',
]);

function parseFixStatus(raw: string | undefined): SpecStatus {
  const v = raw?.trim() as SpecStatus;
  return VALID_STATUSES.has(v) ? v : 'open';
}

function parseGate(raw: string | undefined): Gate {
  const n = parseInt(raw ?? '0', 10);
  return (n >= 0 && n <= 4 ? n : 0) as Gate;
}
