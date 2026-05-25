import { describe, expect, it } from 'vitest';
import {
  resolveRequestedAgentMode,
  validateAgentControl,
} from '../../../packages/core-server/src/routes/agentRoute';
import { validateBatchControl } from '../../../packages/core-server/src/routes/batchRoute';

describe('core-server control parity guards', () => {
  it('validateBatchControl blocks story filter outside generate unified mode', () => {
    const result = validateBatchControl({
      generate: false,
      unified: false,
      storyId: '001',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.markdown).toContain('--generate --unified');
    }
  });

  it('validateBatchControl allows story filter in generate unified mode', () => {
    const result = validateBatchControl({
      generate: true,
      unified: true,
      storyId: '001',
    });
    expect(result.ok).toBe(true);
  });

  it('validateBatchControl blocks branch strategy outside generate unified mode', () => {
    const result = validateBatchControl({
      generate: true,
      unified: false,
      branchStrategy: 'session',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.markdown).toContain('--generate --unified');
    }
  });

  it('validateBatchControl allows branch strategy and confirm in generate unified mode', () => {
    const result = validateBatchControl({
      generate: true,
      unified: true,
      branchStrategy: 'session',
      confirmIntentId: 'exec-123',
    });
    expect(result.ok).toBe(true);
  });

  it('validateBatchControl rejects invalid branch strategy values', () => {
    const result = validateBatchControl({
      generate: true,
      unified: true,
      branchStrategy: 'invalid',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.markdown).toContain('session');
      expect(result.markdown).toContain('cited');
    }
  });

  it('resolveRequestedAgentMode normalizes valid mode and rejects invalid', () => {
    expect(resolveRequestedAgentMode('  Debugger ')).toBe('debugger');
    expect(resolveRequestedAgentMode('invalid-mode')).toBeUndefined();
    expect(resolveRequestedAgentMode(undefined)).toBeUndefined();
  });

  it('validateAgentControl requires intent id when confirm is provided', () => {
    const result = validateAgentControl({
      mode: undefined,
      confirmIntentId: '   ',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.markdown).toContain('--confirm <codigo>');
      expect(result.markdown).toContain('Nada será alterado');
    }
  });

  it('validateAgentControl accepts mode request and confirm request', () => {
    const modeResult = validateAgentControl({ mode: ' Revisor ' });
    expect(modeResult.ok).toBe(true);
    if (modeResult.ok) {
      expect(modeResult.requestedMode).toBe('revisor');
      expect(modeResult.confirmIntentId).toBeUndefined();
    }

    const confirmResult = validateAgentControl({
      confirmIntentId: 'exec-123',
    });
    expect(confirmResult.ok).toBe(true);
    if (confirmResult.ok) {
      expect(confirmResult.requestedMode).toBeUndefined();
      expect(confirmResult.confirmIntentId).toBe('exec-123');
    }
  });
});
