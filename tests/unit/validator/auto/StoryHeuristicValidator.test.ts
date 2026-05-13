import { describe, it, expect } from 'vitest';
import { StoryHeuristicValidator } from '../../../../src/validator/auto/StoryHeuristicValidator';
import { emptyStory } from '../../../../src/story/Story';
import type { ValidatorContext } from '../../../../src/validator/auto/types';
import type { IFileSystem } from '../../../../src/generator/utils/IFileSystem';
import type { Story } from '../../../../src/story/Story';

const fs: IFileSystem = {
  ensureDir: async () => {},
  writeFile: async () => {},
  readFile: async () => '',
  fileExists: async () => false,
  listDir: async () => [],
  deleteFile: async () => {},
  deleteDir: async () => {},
};

function ctx(story?: Story): ValidatorContext {
  return { workspaceRoot: '/ws', fs, story };
}

function storyWithCriterion(criterion: string): Story {
  const s = emptyStory();
  s.functionalSpec.acceptanceCriteria = [criterion];
  return s;
}

describe('StoryHeuristicValidator', () => {
  const v = new StoryHeuristicValidator();

  it('returns no findings when story is missing', async () => {
    expect(await v.run(ctx())).toEqual([]);
  });

  it('returns no findings for a generic story without trigger terms', async () => {
    const s = emptyStory();
    s.metadata.title = 'Login simples';
    s.businessRequirement.problem = 'Usuário precisa entrar no sistema';
    s.functionalSpec.acceptanceCriteria = ['Tela de login renderiza'];
    const findings = await v.run(ctx(s));
    expect(findings).toEqual([]);
  });

  it('emits idempotency finding when spec mentions POST/event', async () => {
    const s = emptyStory();
    s.functionalSpec.acceptanceCriteria = ['Consumir eventos do tópico Kafka movimentacoes'];
    const findings = await v.run(ctx(s));
    expect(findings.map((f) => f.metadata?.ruleId)).toContain('idempotency');
  });

  it('does not emit idempotency when acceptance already mentions idempotência', async () => {
    const s = emptyStory();
    s.functionalSpec.acceptanceCriteria = [
      'Consumir eventos do tópico Kafka',
      'Processar eventos duplicados de forma idempotente',
    ];
    const findings = await v.run(ctx(s));
    expect(findings.map((f) => f.metadata?.ruleId)).not.toContain('idempotency');
  });

  it('emits state-machine finding when spec mentions status/transição', async () => {
    const s = storyWithCriterion('Pedido transiciona entre status PENDING e CONFIRMED');
    const findings = await v.run(ctx(s));
    expect(findings.map((f) => f.metadata?.ruleId)).toContain('state-machine');
  });

  it('emits recovery finding when spec mentions persistência/transação', async () => {
    const s = storyWithCriterion('Persistir registro em transação no banco');
    const findings = await v.run(ctx(s));
    expect(findings.map((f) => f.metadata?.ruleId)).toContain('recovery');
  });

  it('emits BVA finding when spec mentions limite/máximo', async () => {
    const s = storyWithCriterion('Valor da transação deve ser no máximo 10000 e no mínimo 0');
    const findings = await v.run(ctx(s));
    expect(findings.map((f) => f.metadata?.ruleId)).toContain('boundary-values');
  });

  it('emits concurrency finding when spec mentions concorrência', async () => {
    const s = storyWithCriterion('Suportar operações concorrentes no mesmo recurso');
    const findings = await v.run(ctx(s));
    expect(findings.map((f) => f.metadata?.ruleId)).toContain('concurrency');
  });

  it('emits multiple findings when spec triggers multiple rules', async () => {
    const s = emptyStory();
    s.metadata.title = 'Processamento de comissões';
    s.functionalSpec.acceptanceCriteria = [
      'Consumir eventos do tópico Kafka comissoes',
      'Persistir em transação na tabela comissoes',
      'Valor mínimo da comissão é 0 e máximo é 10000',
    ];
    const findings = await v.run(ctx(s));
    const ids = findings.map((f) => f.metadata?.ruleId);
    expect(ids).toContain('idempotency');
    expect(ids).toContain('recovery');
    expect(ids).toContain('boundary-values');
  });

  it('all findings are warn severity with suggestedFix populated', async () => {
    const s = storyWithCriterion('Persistir em transação no banco');
    const findings = await v.run(ctx(s));
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.severity).toBe('warn');
      expect(f.suggestedFix).toBeTruthy();
      expect(f.validator).toBe('story-heuristic');
    }
  });

  it('honors custom rule list when provided', async () => {
    const custom = new StoryHeuristicValidator([
      {
        id: 'custom-rule',
        label: 'Custom',
        triggers: /banana/i,
        alreadyCovered: /banana validada/i,
        suggestedCriterion: 'Validar bananas',
        rationale: 'menciona banana',
      },
    ]);
    const s = storyWithCriterion('A spec menciona banana');
    const findings = await custom.run(ctx(s));
    expect(findings).toHaveLength(1);
    expect(findings[0].metadata?.ruleId).toBe('custom-rule');
  });
});
