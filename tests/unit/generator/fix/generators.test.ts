import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Fix, TechStackDetection } from '../../../../src/fix/Fix';
import { parseFix } from '../../../../src/fix/FixParser';
import { generateFixImplementadorAgent } from '../../../../src/generator/agent/FixImplementadorAgentGenerator';
import { generateFixRevisorAgent } from '../../../../src/generator/agent/FixRevisorAgentGenerator';
import {
  generateFixGapFillingPrompt,
  generateFixImplementPrompt,
  generateFixReviewPrompt,
  generateFixRunPrompt,
} from '../../../../src/generator/fix/FixPromptsGenerator';

const fixturesDir = resolve(__dirname, '../../../fixtures');
const completeFixMd = readFileSync(resolve(fixturesDir, 'fix-complete.md'), 'utf-8');
const completeFix = parseFix(completeFixMd);

const mockStack: TechStackDetection = {
  language: 'typescript',
  framework: 'react',
  architecture: 'hexagonal',
  target: 'frontend',
  projectStage: 'brownfield',
  confidence: 'high',
  source: 'package.json',
};

function emptyFix(): Fix {
  return {
    metadata: {
      id: '',
      title: '',
      createdAt: '',
      version: 1,
      type: 'fix',
      status: 'open',
      gate: 0,
    },
    bugDescription: {
      title: '',
      symptoms: '',
      stepsToReproduce: [],
      environment: '',
      frequency: '',
    },
    rootCauseHypothesis: { hypothesis: '', suspectedFiles: [], suspectedComponents: [] },
    impactAssessment: { severity: '', affectedUsers: '', affectedSystems: [], regressionRisk: '' },
    regressionPrevention: { testsToAdd: [] },
    technicalContext: { messaging: '', database: '' },
    dof: { criteria: [] },
  };
}

describe('FixPromptsGenerator', () => {
  describe('generateFixImplementPrompt', () => {
    it('contains fix title', () => {
      const result = generateFixImplementPrompt(completeFix, mockStack);
      expect(result).toContain('Login OAuth2 retorna 500 após expiração do token');
    });

    it('contains tech stack', () => {
      const result = generateFixImplementPrompt(completeFix, mockStack);
      expect(result).toContain('typescript');
      expect(result).toContain('react');
      expect(result).toContain('hexagonal');
    });

    it('contains Gate 0 marker', () => {
      const result = generateFixImplementPrompt(completeFix, mockStack);
      expect(result).toContain('Gate 0');
    });

    it('contains Gate 1 marker', () => {
      const result = generateFixImplementPrompt(completeFix, mockStack);
      expect(result).toContain('Gate 1');
    });

    it('contains Gate 2 marker', () => {
      const result = generateFixImplementPrompt(completeFix, mockStack);
      expect(result).toContain('Gate 2');
    });

    it('contains 80% coverage threshold', () => {
      const result = generateFixImplementPrompt(completeFix, mockStack);
      expect(result).toContain('80%');
    });

    it('contains fix commit pattern', () => {
      const result = generateFixImplementPrompt(completeFix, mockStack);
      expect(result).toMatch(/git commit -m "fix\(\S+\):/);
    });

    it('contains DoF criteria from fix', () => {
      const result = generateFixImplementPrompt(completeFix, mockStack);
      expect(result).toContain('Bug não reproduz mais com os passos documentados');
    });

    it('does not throw for empty fix', () => {
      expect(() => generateFixImplementPrompt(emptyFix(), mockStack)).not.toThrow();
    });
  });

  describe('generateFixReviewPrompt', () => {
    it('contains fix data', () => {
      const result = generateFixReviewPrompt(completeFix, mockStack);
      expect(result.length).toBeGreaterThan(0);
    });

    it('contains Gate 3 marker', () => {
      const result = generateFixReviewPrompt(completeFix, mockStack);
      expect(result).toContain('Gate 3');
    });

    it('contains Gate 4 marker', () => {
      const result = generateFixReviewPrompt(completeFix, mockStack);
      expect(result).toContain('Gate 4');
    });

    it('contains independent reviewer context (Sessão B)', () => {
      const result = generateFixReviewPrompt(completeFix, mockStack);
      expect(result).toMatch(/Sessão B|revisor independente/i);
    });

    it('contains git rebase origin/develop in Gate 4', () => {
      const result = generateFixReviewPrompt(completeFix, mockStack);
      expect(result).toContain('git rebase origin/develop');
    });

    it('contains DoF criteria from fix', () => {
      const result = generateFixReviewPrompt(completeFix, mockStack);
      expect(result).toContain('Bug não reproduz mais com os passos documentados');
    });

    it('contains fix commit pattern for post-review corrections', () => {
      const result = generateFixReviewPrompt(completeFix, mockStack);
      expect(result).toMatch(/git commit -m "fix\(\S+\): correção pós-revisão/);
    });

    it('does not throw for empty fix', () => {
      expect(() => generateFixReviewPrompt(emptyFix(), mockStack)).not.toThrow();
    });
  });

  describe('generateFixRunPrompt', () => {
    it('contains fix data', () => {
      const result = generateFixRunPrompt(completeFix, mockStack);
      expect(result.length).toBeGreaterThan(0);
    });

    it('contains all 4 gate markers (monolithic mode)', () => {
      const result = generateFixRunPrompt(completeFix, mockStack);
      expect(result).toContain('Gate 0');
      expect(result).toContain('Gate 1');
      expect(result).toContain('Gate 2');
      expect(result).toContain('Gate 3');
      expect(result).toContain('Gate 4');
    });

    it('contains rebase instruction in Gate 4', () => {
      const result = generateFixRunPrompt(completeFix, mockStack);
      expect(result).toMatch(/[Rr]ebase/);
    });

    it('contains tech stack from fix', () => {
      const result = generateFixRunPrompt(completeFix, mockStack);
      expect(result).toContain('typescript');
      expect(result).toContain('react');
      expect(result).toContain('hexagonal');
    });

    it('contains 80% coverage threshold', () => {
      const result = generateFixRunPrompt(completeFix, mockStack);
      expect(result).toContain('80%');
    });

    it('contains fix commit pattern', () => {
      const result = generateFixRunPrompt(completeFix, mockStack);
      expect(result).toMatch(/git commit -m "fix\(\S+\):/);
    });

    it('contains DoF criteria', () => {
      const result = generateFixRunPrompt(completeFix, mockStack);
      expect(result).toContain('Bug não reproduz mais com os passos documentados');
    });

    it('does not throw for empty fix', () => {
      expect(() => generateFixRunPrompt(emptyFix(), mockStack)).not.toThrow();
    });
  });

  describe('generateFixGapFillingPrompt', () => {
    it('contains gap information', () => {
      const gaps = [{ section: 'Bug Description', field: 'title', message: 'Título obrigatório' }];
      const result = generateFixGapFillingPrompt(completeFix, gaps);
      expect(result.length).toBeGreaterThan(0);
    });

    it('mentions field name when gap is title', () => {
      const gaps = [{ section: 'Bug Description', field: 'title', message: 'Título obrigatório' }];
      const result = generateFixGapFillingPrompt(completeFix, gaps);
      expect(result).toContain('title');
    });

    it('mentions field name when gap is symptoms', () => {
      const gaps = [
        { section: 'Bug Description', field: 'symptoms', message: 'Sintomas obrigatórios' },
      ];
      const result = generateFixGapFillingPrompt(completeFix, gaps);
      expect(result).toContain('symptoms');
    });

    it('lists all provided gaps', () => {
      const gaps = [
        { section: 'Bug Description', field: 'title', message: 'Título obrigatório' },
        { section: 'Impact Assessment', field: 'severity', message: 'Severidade obrigatória' },
      ];
      const result = generateFixGapFillingPrompt(completeFix, gaps);
      expect(result).toContain('title');
      expect(result).toContain('severity');
      expect(result).toContain('Lacunas identificadas (2)');
    });
  });
});

describe('Fix Agent Generators — no tool-setup instructions', () => {
  it('fix-implementador agent does NOT contain tool-setup instructions', () => {
    const result = generateFixImplementadorAgent(completeFix, mockStack);
    expect(result).not.toContain('PRÉ-REQUISITO OBRIGATÓRIO');
    expect(result).not.toContain('REGRA ZERO');
    expect(result).not.toContain('REGRA DE EXECUÇÃO');
    expect(result).not.toContain('habilitar ferramentas');
    expect(result).not.toContain('tool_search_tool_regex');
    expect(result).not.toContain('tools: ["*"]');
    expect(result).toContain('read/readFile');
    expect(result).toContain('execute/runInTerminal');
    expect(result).toContain('Protocolo de governança');
  });

  it('fix-revisor agent does NOT contain tool-setup instructions', () => {
    const result = generateFixRevisorAgent(completeFix, mockStack);
    expect(result).not.toContain('PRÉ-REQUISITO OBRIGATÓRIO');
    expect(result).not.toContain('REGRA ZERO');
    expect(result).not.toContain('tool_search_tool_regex');
    expect(result).not.toContain('tools: ["*"]');
    expect(result).toContain('read/readFile');
    expect(result).toContain('execute/runInTerminal');
    expect(result).toContain('Protocolo de governança');
  });

  it('fix-revisor agent requires user confirmation before corrections', () => {
    const result = generateFixRevisorAgent(completeFix, mockStack);
    expect(result).toContain('NUNCA implemente correções sem aprovação explícita do usuário');
    expect(result).toContain('GATE DE CONFIRMAÇÃO');
    expect(result).toContain('AGUARDE aprovação explícita do usuário');
  });
});
