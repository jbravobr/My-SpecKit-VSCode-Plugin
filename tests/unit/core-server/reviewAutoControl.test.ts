import { describe, expect, it } from 'vitest';
import {
  applyStoryTransition,
  buildTransitionProposal,
  parseReviewAutoControl,
} from '../../../packages/core-server/src/routes/reviewAutoRoute';
import {
  formatExplicitConfirmationNotice,
  formatInvalidConfirmationNotice,
} from '../../../packages/core-server/src/routes/confirmationMarkdown';

const STORY_METADATA_FIXTURE = `<!-- metadata
id: 001
title: Test Story
createdAt: 2026-05-15T00:00:00.000Z
version: 1
type: story
status: review
gate: 3
dependsOn: []
-->

# STORY-001
`;

describe('core-server review-auto control parity', () => {
  it('parseReviewAutoControl resolves approved action and confirm id', () => {
    const control = parseReviewAutoControl({
      approved: true,
      confirmIntentId: 'exec-123',
    });

    expect(control.error).toBeUndefined();
    expect(control.action).toBe('approved');
    expect(control.confirmIntentId).toBe('exec-123');
  });

  it('parseReviewAutoControl blocks conflicting actions', () => {
    const control = parseReviewAutoControl({
      approved: true,
      changesRequested: true,
    });

    expect(control.error).toContain('Flags conflitantes');
  });

  it('parseReviewAutoControl explains missing confirmation code', () => {
    const control = parseReviewAutoControl({ prompt: '--confirm' });

    expect(control.error).toContain('--confirm <codigo>');
    expect(control.error).toContain('Nada será alterado');
  });

  it('buildTransitionProposal maps changes-requested target', () => {
    const proposal = buildTransitionProposal('changes-requested');
    expect(proposal).toBeDefined();
    expect(proposal?.toGate).toBe(2);
    expect(proposal?.toStatus).toBe('in-progress');
  });

  it('applyStoryTransition updates metadata for approved transition', () => {
    const transition = applyStoryTransition(
      STORY_METADATA_FIXTURE,
      3,
      'review',
      4,
      'ready-to-commit',
      'approved',
    );

    expect(transition.changed).toBe(true);
    expect(transition.summary.toGate).toBe(4);
    expect(transition.summary.toStatus).toBe('ready-to-commit');
    expect(transition.content).toContain('gate: 4');
    expect(transition.content).toContain('status: ready-to-commit');
  });

  it('applyStoryTransition rejects skipped gate transitions', () => {
    expect(() =>
      applyStoryTransition(
        STORY_METADATA_FIXTURE.replace('gate: 3', 'gate: 1').replace(
          'status: review',
          'status: in-progress',
        ),
        1,
        'in-progress',
        3,
        'review',
        'skip gate',
      ),
    ).toThrow('Transição automática de gate bloqueada');
  });

  it('formats core-server explicit confirmation notice with accessible wording', () => {
    const markdown = formatExplicitConfirmationNotice({
      intentId: 'intent-123',
      confirmCommand: '/review-auto --approved --confirm intent-123',
      confirmEffect: 'o gate/status será persistido.',
      noConfirmationEffect: 'nenhuma alteração será persistida.',
      ttlMinutes: 30,
    });

    expect(markdown).toContain('Código de confirmação desta proposta');
    expect(markdown).toContain('Intent-ID: `intent-123`');
    expect(markdown).toContain('/review-auto --approved --confirm intent-123');
    expect(markdown).toContain('nenhuma alteração será persistida');
    expect(markdown).toContain('expira em 30 minutos');
  });

  it('formats core-server invalid confirmation notice with no-change guarantee', () => {
    const markdown = formatInvalidConfirmationNotice(
      'invalid-confirmation',
      '/review-auto --approved',
      'transição de gate/status',
    );

    expect(markdown).toContain('Código de confirmação inválido ou expirado');
    expect(markdown).toContain('Nada foi alterado');
    expect(markdown).toContain('/review-auto --approved');
  });
});
