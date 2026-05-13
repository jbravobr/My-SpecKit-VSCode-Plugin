import type { Story } from '../story/Story';

export interface ScoreBreakdownItem {
  key: string;
  label: string;
  weight: number;
  earned: number;
  reason?: string;
}

export interface CompletenessReport {
  score: number; // 0..100
  level: 'baixa' | 'média' | 'alta' | 'excelente';
  breakdown: ScoreBreakdownItem[];
  recommendations: string[];
}

function nonEmpty(text: string | undefined | null): boolean {
  return typeof text === 'string' && text.trim().length >= 3;
}

function countNonEmpty(items: string[] | undefined): number {
  if (!items) return 0;
  return items.filter((s) => nonEmpty(s)).length;
}

function levelFor(score: number): CompletenessReport['level'] {
  if (score >= 90) return 'excelente';
  if (score >= 75) return 'alta';
  if (score >= 50) return 'média';
  return 'baixa';
}

/**
 * Avalia completude da spec em base estática (sem LLM): preenchimento de campos,
 * quantidade de critérios de aceite, DoD, dependências e disciplinas heurísticas.
 *
 * Não substitui o Revisor — é um sinal rápido (<5ms) para o autor da spec saber
 * se ela está pronta para entrar no fluxo de gates.
 */
export function scoreStory(story: Story): CompletenessReport {
  const breakdown: ScoreBreakdownItem[] = [];

  // 1. Metadata (10pts)
  {
    const w = 10;
    let earned = 0;
    if (nonEmpty(story.metadata.title)) earned += 6;
    if (nonEmpty(story.metadata.id)) earned += 2;
    if (story.metadata.gate !== undefined) earned += 2;
    breakdown.push({
      key: 'metadata',
      label: 'Metadata (title, id, gate)',
      weight: w,
      earned,
      reason: earned < w ? 'Preencher título da story e checar id/gate na metadata.' : undefined,
    });
  }

  // 2. Business requirement (15pts)
  {
    const w = 15;
    let earned = 0;
    if (nonEmpty(story.businessRequirement.problem)) earned += 7;
    if (nonEmpty(story.businessRequirement.value)) earned += 5;
    if ((story.businessRequirement.stakeholders ?? []).length > 0) earned += 3;
    breakdown.push({
      key: 'business',
      label: 'Requisito de negócio (problema, valor, stakeholders)',
      weight: w,
      earned,
      reason:
        earned < w
          ? 'Descrever problema, valor entregue e listar pelo menos 1 stakeholder.'
          : undefined,
    });
  }

  // 3. Functional spec (25pts)
  {
    const w = 25;
    const userStories = countNonEmpty(story.functionalSpec.userStories);
    const acs = countNonEmpty(story.functionalSpec.acceptanceCriteria);
    const oos = countNonEmpty(story.functionalSpec.outOfScope);
    let earned = 0;
    earned += Math.min(8, userStories * 4); // até 8
    earned += Math.min(14, acs * 2); // até 14 (7 ACs satura)
    earned += Math.min(3, oos * 1); // até 3
    breakdown.push({
      key: 'functional',
      label: 'Spec funcional (user stories, ACs, out-of-scope)',
      weight: w,
      earned,
      reason:
        acs < 3
          ? `Spec tem ${acs} critério(s) de aceite — alvo mínimo: 3 para entrar em desenvolvimento.`
          : undefined,
    });
  }

  // 4. Non-functional spec (15pts)
  {
    const w = 15;
    const fields = [
      story.nonFunctionalSpec.performance,
      story.nonFunctionalSpec.security,
      story.nonFunctionalSpec.scalability,
      story.nonFunctionalSpec.usability,
      story.nonFunctionalSpec.availability,
    ];
    const filled = fields.filter((f) => nonEmpty(f)).length;
    const earned = Math.min(w, filled * 3);
    breakdown.push({
      key: 'non-functional',
      label: 'Requisitos não-funcionais (5 dimensões)',
      weight: w,
      earned,
      reason:
        earned < w
          ? `Apenas ${filled}/5 dimensões preenchidas (performance, security, scalability, usability, availability).`
          : undefined,
    });
  }

  // 5. DoD (15pts)
  {
    const w = 15;
    const dods = countNonEmpty(story.dod.criteria);
    const earned = Math.min(w, dods * 3);
    breakdown.push({
      key: 'dod',
      label: 'Definition of Done',
      weight: w,
      earned,
      reason:
        dods < 4
          ? `DoD tem ${dods} item(s) — recomendado: ≥5 (build, type-check, testes, cobertura, sem secrets).`
          : undefined,
    });
  }

  // 6. Disciplinas de teste explícitas em ACs/DoD (10pts)
  {
    const w = 10;
    const allText = [...story.functionalSpec.acceptanceCriteria, ...story.dod.criteria]
      .join('\n')
      .toLowerCase();
    const disciplines = [
      { re: /happy[- ]?path/, k: 'happy-path' },
      { re: /edge case|borda|bva/, k: 'edge-case' },
      { re: /idempot/, k: 'idempotência' },
      { re: /cobertura|coverage/, k: 'cobertura' },
      { re: /resili[eê]ncia|retry|timeout|circuit/, k: 'resiliência' },
    ];
    const hit = disciplines.filter((d) => d.re.test(allText)).length;
    const earned = Math.min(w, hit * 2);
    breakdown.push({
      key: 'disciplines',
      label: 'Disciplinas de teste explícitas (happy, edge, idempot, cov, resil)',
      weight: w,
      earned,
      reason:
        hit < 3
          ? `Só ${hit}/5 disciplinas mencionadas. Considere acrescentar critérios cobrindo as ausentes.`
          : undefined,
    });
  }

  // 7. Dependências/rastreabilidade (10pts)
  {
    const w = 10;
    const deps = (story.metadata.dependsOn ?? []).length;
    const status = nonEmpty(story.metadata.status) ? 4 : 0;
    const versioned = (story.metadata.version ?? 0) >= 1 ? 4 : 0;
    const depsScore = deps === 0 ? 2 : Math.min(2, 2); // sem deps já vale 2 (auto-suficiente)
    const earned = Math.min(w, status + versioned + depsScore);
    breakdown.push({
      key: 'traceability',
      label: 'Rastreabilidade (status, version, dependsOn)',
      weight: w,
      earned,
    });
  }

  const totalWeight = breakdown.reduce((acc, b) => acc + b.weight, 0);
  const totalEarned = breakdown.reduce((acc, b) => acc + b.earned, 0);
  const score = Math.round((totalEarned / totalWeight) * 100);
  const recommendations = breakdown
    .filter((b) => b.reason && b.earned < b.weight)
    .map((b) => `[${b.label}] ${b.reason}`);

  return {
    score,
    level: levelFor(score),
    breakdown,
    recommendations,
  };
}
