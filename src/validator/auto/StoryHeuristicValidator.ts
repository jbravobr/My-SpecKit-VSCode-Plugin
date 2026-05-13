import type { Story } from '../../story/Story';
import type { Finding, Validator, ValidatorContext } from './types';

export interface HeuristicRule {
  id: string;
  label: string;
  triggers: RegExp;
  alreadyCovered: RegExp;
  suggestedCriterion: string;
  rationale: string;
}

export const DEFAULT_HEURISTIC_RULES: HeuristicRule[] = [
  {
    id: 'idempotency',
    label: 'Idempotência',
    triggers:
      /\b(post|put|patch|publicar|publish|emitir evento|envio de evento|consumir eventos?|consumer|retry|reprocess|reentrega|webhook|enfileir)\w*\b/i,
    alreadyCovered: /\bidempot\w*/i,
    suggestedCriterion:
      'Operação deve ser idempotente: requisições/eventos duplicados (mesmo identificador) não devem produzir efeito colateral repetido nem registro duplicado',
    rationale:
      'A spec menciona operação de escrita, publicação ou consumo de evento — exigir teste de idempotência.',
  },
  {
    id: 'state-machine',
    label: 'Teste de máquina de estado',
    triggers: /\b(status|estado|transi[cç][aã]o|workflow|fluxo de estado|state\b)\w*\b/i,
    alreadyCovered: /\b(state[- ]?based|m[aá]quina de estado|transi[cç][aã]o testada)\w*/i,
    suggestedCriterion:
      'Cobrir transições de estado válidas e inválidas com testes: cada caminho de transição declarado deve ter ao menos um teste verde e um teste negativo',
    rationale:
      'A spec menciona status/estado/transição — exigir testes de máquina de estado (transições válidas e inválidas).',
  },
  {
    id: 'recovery',
    label: 'Recovery e consistência pós-falha',
    triggers:
      /\b(persist\w+|transa[cç][aã]o|transactional|rollback|fila|queue|kafka|rabbit|sqs|outbox|inbox|crash|reinicializa\w+)\b/i,
    alreadyCovered: /\b(recovery|recupera[cç][aã]o|p[oó]s[- ]falha|resili[eê]ncia testada)\w*/i,
    suggestedCriterion:
      'Validar recovery: após falha simulada (crash/timeout durante operação), o sistema deve restaurar consistência sem perda de dados nem efeito duplicado',
    rationale:
      'A spec menciona persistência, transação ou fila — exigir teste de recovery após falha.',
  },
  {
    id: 'boundary-values',
    label: 'Análise de valores de borda (BVA)',
    triggers:
      /\b(limite|m[aá]ximo|m[ií]nimo|threshold|exato\w*|fronteira|maior que|menor que|igual a)\b/i,
    alreadyCovered: /\b(bva|valor[- ]?limite|edge case|borda)\b/i,
    suggestedCriterion:
      'Cobrir valores de borda (BVA): zero/negativo, mínimo declarado, máximo declarado, mínimo-1, máximo+1, vazio e null — cada um com teste explícito',
    rationale: 'A spec menciona limites/máximos/mínimos — exigir testes de borda explícitos.',
  },
  {
    id: 'concurrency',
    label: 'Concorrência',
    triggers:
      /\b(concorr\w*|paralelo|race|lock|optimistic|pessimistic|simultan\w+|paraleliza\w+)\b/i,
    alreadyCovered: /\b(concorr[eê]ncia testada|teste de race|race[- ]test)\b/i,
    suggestedCriterion:
      'Cobrir cenário de concorrência: operações simultâneas no mesmo recurso devem manter invariantes (sem perda de update, sem condição de corrida observável)',
    rationale: 'A spec menciona concorrência/paralelismo — exigir teste de cenário concorrente.',
  },
];

function gatherStoryText(story: Story): string {
  const parts: string[] = [
    story.metadata.title,
    story.businessRequirement.problem,
    story.businessRequirement.value,
    ...story.functionalSpec.userStories,
    ...story.functionalSpec.acceptanceCriteria,
    ...story.functionalSpec.outOfScope,
    story.nonFunctionalSpec.performance,
    story.nonFunctionalSpec.security,
    story.nonFunctionalSpec.scalability,
    story.nonFunctionalSpec.usability,
    story.nonFunctionalSpec.availability,
    ...story.dod.criteria,
  ];
  return parts.filter(Boolean).join('\n');
}

function gatherAcceptanceText(story: Story): string {
  return [...story.functionalSpec.acceptanceCriteria, ...story.dod.criteria].join('\n');
}

export class StoryHeuristicValidator implements Validator {
  readonly id = 'story-heuristic';
  readonly description =
    'Detecta padrões textuais na spec que exigem disciplinas adicionais de teste (idempotência, state, recovery, BVA, concorrência) e propõe critérios de aceite condicionais.';

  constructor(private readonly rules: HeuristicRule[] = DEFAULT_HEURISTIC_RULES) {}

  async run(ctx: ValidatorContext): Promise<Finding[]> {
    if (!ctx.story) return [];
    const fullText = gatherStoryText(ctx.story);
    const acceptanceText = gatherAcceptanceText(ctx.story);
    const findings: Finding[] = [];

    for (const rule of this.rules) {
      if (!rule.triggers.test(fullText)) continue;
      if (rule.alreadyCovered.test(acceptanceText)) continue;
      findings.push({
        validator: this.id,
        severity: 'warn',
        message: `${rule.label} ausente nos critérios — ${rule.rationale}`,
        suggestedFix: rule.suggestedCriterion,
        metadata: { ruleId: rule.id, label: rule.label },
      });
    }

    return findings;
  }
}
