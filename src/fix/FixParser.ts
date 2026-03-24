import { Fix, FixMetadata, Severity } from './Fix';
import { SpecStatus } from '../story/Story';
import {
  buildSectionMap,
  parseMetaFields,
  extractBulletList,
  parseDofItems,
  cleanTodo,
  RE_META_BLOCK,
} from '../parser/BaseParser';

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

