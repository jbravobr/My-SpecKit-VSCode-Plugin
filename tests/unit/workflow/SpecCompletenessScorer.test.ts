import { describe, expect, it } from 'vitest';
import { emptyStory } from '../../../src/story/Story';
import { scoreStory } from '../../../src/workflow/SpecCompletenessScorer';

describe('SpecCompletenessScorer', () => {
  it('gives a low score for an empty story', () => {
    const r = scoreStory(emptyStory());
    expect(r.score).toBeLessThan(30);
    expect(r.level).toBe('baixa');
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it('rises as fields are filled', () => {
    const s = emptyStory();
    s.metadata.id = 'STORY-1';
    s.metadata.title = 'Login';
    s.metadata.status = 'open';
    s.metadata.version = 1;
    s.businessRequirement.problem = 'usuário não loga';
    s.businessRequirement.value = 'reduz suporte';
    s.businessRequirement.stakeholders = ['produto'];
    s.functionalSpec.userStories = ['Como usuário quero logar'];
    s.functionalSpec.acceptanceCriteria = [
      'AC1: happy path validado',
      'AC2: edge case credenciais inválidas',
      'AC3: cobertura mínima 80%',
      'AC4: idempotência em retry',
    ];
    s.functionalSpec.outOfScope = ['SSO'];
    s.nonFunctionalSpec.performance = 'p95 < 200ms';
    s.nonFunctionalSpec.security = 'OWASP A07';
    s.nonFunctionalSpec.scalability = '10k rps';
    s.nonFunctionalSpec.usability = 'mobile-first';
    s.nonFunctionalSpec.availability = '99.9%';
    s.dod.criteria = ['build verde', 'tsc verde', 'testes verdes', 'cov >= 80%', 'sem secrets'];

    const r = scoreStory(s);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.level === 'alta' || r.level === 'excelente').toBe(true);
  });

  it('detects fewer than 3 acceptance criteria', () => {
    const s = emptyStory();
    s.functionalSpec.acceptanceCriteria = ['AC1'];
    const r = scoreStory(s);
    const functional = r.breakdown.find((b) => b.key === 'functional');
    expect(functional?.reason).toMatch(/critério/);
  });

  it('always returns 0..100', () => {
    const r1 = scoreStory(emptyStory());
    expect(r1.score).toBeGreaterThanOrEqual(0);
    expect(r1.score).toBeLessThanOrEqual(100);
  });
});
