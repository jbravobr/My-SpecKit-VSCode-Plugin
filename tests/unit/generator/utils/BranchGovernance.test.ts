import { describe, expect, it } from 'vitest';
import {
  detectBranchMentions,
  detectBatchBranchMentions,
  generateDraftBranchGovernanceSection,
  generateRuntimeBranchGovernanceSection,
} from '../../../../src/generator/utils/BranchGovernance';
import { emptyStory } from '../../../../src/story/Story';

describe('BranchGovernance', () => {
  it('detects explicit branch mentions from text', () => {
    const mentions = detectBranchMentions(
      'A story cita a branch develop e depois manda continuar na feature/batch-20260509-auth.',
    );

    expect(mentions).toContain('develop');
    expect(mentions).toContain('feature/batch-20260509-auth');
  });

  it('generates draft governance section only when there are branch mentions', () => {
    expect(generateDraftBranchGovernanceSection([])).toBe('');

    const result = generateDraftBranchGovernanceSection(['develop']);
    expect(result).toContain('FASE 0 — Governança de branch');
    expect(result).toContain('usar sempre a branch carregada na sessão do VS Code');
    expect(result).toContain('**não** procure, não crie e não troque branch');
  });

  it('generates runtime anti-loop protocol for cited branches', () => {
    const result = generateRuntimeBranchGovernanceSection({
      mentions: ['develop'],
      defaultSessionBranch: 'feature/batch-<yyyymmdd>-<slug>',
      sessionBranchLabel: 'a branch única do lote',
      noLoopExample: '`develop`',
    });

    expect(result).toContain('Protocolo de branch citada');
    expect(result).toContain('feature/batch-<yyyymmdd>-<slug>');
    expect(result).toContain('**não** volte a procurar/criar `develop`');
  });

  it('aggregates cited branches across batch stories', () => {
    const storyA = emptyStory();
    storyA.metadata.id = '001';
    storyA.businessRequirement.problem = 'A story cita a branch develop.';

    const storyB = emptyStory();
    storyB.metadata.id = '002';
    storyB.functionalSpec.acceptanceCriteria = ['Continuar na feature/batch-20260509-auth'];

    expect(detectBatchBranchMentions([storyA, storyB])).toEqual([
      'develop',
      'feature/batch-20260509-auth',
    ]);
  });
});
