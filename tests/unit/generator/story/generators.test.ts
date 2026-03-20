import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseStory } from '../../../../src/story/StoryParser';
import { emptyStory } from '../../../../src/story/Story';
import {
  generateImplementPrompt,
  generateReviewPrompt,
  generateRunPrompt,
  generateGapFillingPrompt,
} from '../../../../src/generator/story/PromptsGenerator';

const fixturesDir = resolve(__dirname, '../../../fixtures');
const completeStoryMd = readFileSync(resolve(fixturesDir, 'story-complete.md'), 'utf-8');
const completeStory = parseStory(completeStoryMd);

// Camada 1 — Audit estático (resultado):
// Todos os campos de Story são utilizados em pelo menos um generator:
// - nonFunctionalSpec.scalability/usability/availability → NonFunctionalGenerator ✓
// - technicalSpec.database/infrastructure → TechStackGenerator ✓
// - dod.criteria[] → DodGenerator + ReviewPrompt (PORTÃO 3/4) ✓
// Nenhum campo orphan identificado.

describe('PromptsGenerator', () => {
  describe('generateImplementPrompt', () => {
    it('contains story title', () => {
      const result = generateImplementPrompt(completeStory);
      expect(result).toContain('Autenticação via OAuth2 com GitHub');
    });

    it('contains tech stack', () => {
      const result = generateImplementPrompt(completeStory);
      expect(result).toContain('typescript');
      expect(result).toContain('react');
      expect(result).toContain('hexagonal');
    });

    it('contains FASE 0 gate marker', () => {
      const result = generateImplementPrompt(completeStory);
      expect(result).toMatch(/FASE 0|PORTÃO 0/i);
    });

    it('contains Gate 1 gate marker', () => {
      const result = generateImplementPrompt(completeStory);
      expect(result).toContain('Gate 1');
    });

    it('contains Gate 2 gate marker', () => {
      const result = generateImplementPrompt(completeStory);
      expect(result).toContain('Gate 2');
    });

    it('contains 80% coverage threshold', () => {
      const result = generateImplementPrompt(completeStory);
      expect(result).toContain('80%');
    });

    it('contains acceptance criteria from story', () => {
      const result = generateImplementPrompt(completeStory);
      expect(result).toContain('Botão "Login com GitHub" presente na página de login');
    });

    it('contains task planning section in PORTÃO 1', () => {
      const result = generateImplementPrompt(completeStory);
      expect(result).toContain('Planejamento de tarefas (faça ANTES de escrever qualquer código)');
      expect(result).toContain('TASK-1');
      expect(result).toContain('Aguarde confirmação do usuário antes de iniciar a TASK-1');
    });

    it('contains feat commit pattern in PORTÃO 1', () => {
      const result = generateImplementPrompt(completeStory);
      expect(result).toMatch(/git commit -m "feat\(\S+\): TASK-N/);
    });

    it('contains test task planning section in PORTÃO 2', () => {
      const result = generateImplementPrompt(completeStory);
      expect(result).toContain('Planejamento das tarefas de teste (faça ANTES de escrever qualquer teste)');
      expect(result).toContain('TEST-1');
    });

    it('contains test commit pattern in PORTÃO 2', () => {
      const result = generateImplementPrompt(completeStory);
      expect(result).toMatch(/git commit -m "test\(\S+\): TEST-N/);
    });

    it('does not throw for empty story', () => {
      expect(() => generateImplementPrompt(emptyStory())).not.toThrow();
    });
  });

  describe('generateReviewPrompt', () => {
    it('contains story data', () => {
      const result = generateReviewPrompt(completeStory);
      expect(result.length).toBeGreaterThan(0);
    });

    it('contains Gate 3 gate marker', () => {
      const result = generateReviewPrompt(completeStory);
      expect(result).toContain('Gate 3');
    });

    it('contains Gate 4 gate marker', () => {
      const result = generateReviewPrompt(completeStory);
      expect(result).toContain('Gate 4');
    });

    it('contains atomic fix planning section in Gate 3', () => {
      const result = generateReviewPrompt(completeStory);
      expect(result).toContain('Planejamento das tarefas de correção (faça ANTES de escrever qualquer fix)');
      expect(result).toContain('FIX-1');
    });

    it('contains fix commit pattern in Gate 3', () => {
      const result = generateReviewPrompt(completeStory);
      expect(result).toMatch(/git commit -m "fix\(\S+\): FIX-N/);
    });

    it('contains git rebase origin/develop in Gate 4', () => {
      const result = generateReviewPrompt(completeStory);
      expect(result).toContain('git rebase origin/develop');
    });

    it('contains DoD criteria from story', () => {
      const result = generateReviewPrompt(completeStory);
      expect(result).toContain('Todos os critérios de aceite validados por testes automatizados');
    });

    it('contains independent reviewer context (Sessão B)', () => {
      const result = generateReviewPrompt(completeStory);
      expect(result).toMatch(/Sessão B|revisor independente/i);
    });

    it('contains acceptance criteria checklist', () => {
      const result = generateReviewPrompt(completeStory);
      expect(result).toContain('Botão "Login com GitHub" presente na página de login');
    });

    it('does not throw for empty story', () => {
      expect(() => generateReviewPrompt(emptyStory())).not.toThrow();
    });
  });

  describe('generateRunPrompt', () => {
    it('contains story data', () => {
      const result = generateRunPrompt(completeStory);
      expect(result.length).toBeGreaterThan(0);
    });

    it('contains all 4 gate markers (monolithic mode)', () => {
      const result = generateRunPrompt(completeStory);
      expect(result).toContain('Gate 1');
      expect(result).toContain('Gate 2');
      expect(result).toContain('Gate 3');
      expect(result).toContain('Gate 4');
    });

    it('contains atomic fix planning section in Gate 3', () => {
      const result = generateRunPrompt(completeStory);
      expect(result).toContain('Planejamento das tarefas de correção (faça ANTES de escrever qualquer fix)');
      expect(result).toContain('FIX-1');
    });

    it('contains fix commit pattern in Gate 3', () => {
      const result = generateRunPrompt(completeStory);
      expect(result).toMatch(/git commit -m "fix\(\S+\): FIX-N/);
    });

    it('contains git rebase origin/develop in Gate 4', () => {
      const result = generateRunPrompt(completeStory);
      expect(result).toContain('git rebase origin/develop');
    });

    it('contains tech stack from story', () => {
      const result = generateRunPrompt(completeStory);
      expect(result).toContain('typescript');
      expect(result).toContain('react');
      expect(result).toContain('hexagonal');
    });

    it('contains 80% coverage threshold', () => {
      const result = generateRunPrompt(completeStory);
      expect(result).toContain('80%');
    });

    it('contains task planning section in PORTÃO 1', () => {
      const result = generateRunPrompt(completeStory);
      expect(result).toContain('Planejamento de tarefas (faça ANTES de escrever qualquer código)');
      expect(result).toContain('TASK-1');
      expect(result).toContain('Aguarde confirmação do usuário antes de iniciar a TASK-1');
    });

    it('contains feat commit pattern in PORTÃO 1', () => {
      const result = generateRunPrompt(completeStory);
      expect(result).toMatch(/git commit -m "feat\(\S+\): TASK-N/);
    });

    it('contains test task planning section in PORTÃO 2', () => {
      const result = generateRunPrompt(completeStory);
      expect(result).toContain('Planejamento das tarefas de teste (faça ANTES de escrever qualquer teste)');
      expect(result).toContain('TEST-1');
    });

    it('contains test commit pattern in PORTÃO 2', () => {
      const result = generateRunPrompt(completeStory);
      expect(result).toMatch(/git commit -m "test\(\S+\): TEST-N/);
    });

    it('does not throw for empty story', () => {
      expect(() => generateRunPrompt(emptyStory())).not.toThrow();
    });
  });

  describe('generateGapFillingPrompt', () => {
    it('contains gap information', () => {
      const gaps = [{ section: 'Metadata', field: 'title', message: 'Título obrigatório' }];
      const result = generateGapFillingPrompt(completeStory, gaps);
      expect(result.length).toBeGreaterThan(0);
    });

    it('mentions field name when gap is language', () => {
      const gaps = [{ section: 'TechnicalSpec', field: 'language', message: 'Linguagem obrigatória' }];
      const result = generateGapFillingPrompt(completeStory, gaps);
      expect(result).toContain('language');
    });

    it('mentions field name when gap is problem', () => {
      const gaps = [{ section: 'BusinessRequirement', field: 'problem', message: 'Problema obrigatório' }];
      const result = generateGapFillingPrompt(completeStory, gaps);
      expect(result).toContain('problem');
    });

    it('lists all provided gaps', () => {
      const gaps = [
        { section: 'Metadata', field: 'title', message: 'Título obrigatório' },
        { section: 'TechnicalSpec', field: 'language', message: 'Linguagem obrigatória' },
      ];
      const result = generateGapFillingPrompt(completeStory, gaps);
      expect(result).toContain('title');
      expect(result).toContain('language');
      expect(result).toContain('Lacunas identificadas (2)');
    });
  });
});
