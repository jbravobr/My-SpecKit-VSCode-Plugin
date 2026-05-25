import { describe, expect, it } from 'vitest';
import { generateVetoSection } from '../../../../src/generator/baseline/GraphVetoGenerator';

describe('generateVetoSection', () => {
  it('contains mandatory graph navigation declarations', () => {
    const section = generateVetoSection();

    expect(section).toContain('Veto Protocol — GRAPH_NAVIGATION');
    expect(section).toContain('CONSULTEI');
    expect(section).toContain('VETO_GRAPH_NOT_AVAILABLE');
    expect(section).toContain('Sem declaração explícita');
  });
});
