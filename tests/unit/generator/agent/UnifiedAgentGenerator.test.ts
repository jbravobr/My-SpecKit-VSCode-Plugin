import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { generateImplementadorContent } from '../../../../src/generator/agent/StoryImplementadorAgentGenerator';
import { generateRevisorContent } from '../../../../src/generator/agent/StoryRevisorAgentGenerator';
import { generateUnifiedAgent } from '../../../../src/generator/agent/StoryUnifiedAgentGenerator';
import { emptyStory, type Story } from '../../../../src/story/Story';
import { parseStory } from '../../../../src/story/StoryParser';

const fixturesDir = resolve(__dirname, '../../../fixtures');
const completeStory = parseStory(readFileSync(resolve(fixturesDir, 'story-complete.md'), 'utf-8'));

function storyWithDeps(deps: string[]): Story {
  const s = emptyStory();
  s.metadata.id = '001';
  s.metadata.title = 'Test Story';
  s.metadata.dependsOn = deps;
  s.technicalSpec.language = 'typescript';
  s.technicalSpec.framework = 'react';
  s.technicalSpec.architecture = 'hexagonal';
  s.functionalSpec.acceptanceCriteria = ['CA-1: Login funciona', 'CA-2: Logout funciona'];
  s.dod.criteria = ['Cobertura >= 80%', 'Testes passando'];
  return s;
}

describe('StoryUnifiedAgentGenerator', () => {
  describe('generateUnifiedAgent', () => {
    it('contains YAML frontmatter with unified agent name', () => {
      const result = generateUnifiedAgent(completeStory);
      expect(result).toMatch(/^---\n/);
      expect(result).toContain('name: speckit-story-001');
    });

    it('contains story stack in the description', () => {
      const result = generateUnifiedAgent(completeStory);
      expect(result).toContain('typescript');
      expect(result).toContain('react');
      expect(result).toContain('hexagonal');
    });

    it('contains both MODO IMPLEMENTADOR and MODO REVISOR sections', () => {
      const result = generateUnifiedAgent(completeStory);
      expect(result).toContain('MODO IMPLEMENTADOR');
      expect(result).toContain('MODO REVISOR');
    });

    it('contains dependency protocol', () => {
      const result = generateUnifiedAgent(completeStory);
      expect(result).toContain('PROTOCOLO DE DEPENDÊNCIA');
    });

    it('treats metadata depends-on as the only dependency source', () => {
      const result = generateUnifiedAgent(completeStory);
      expect(result).toContain('somente** o campo `depends-on` no metadata');
      expect(result).toContain('citações a outras stories/fixes no corpo da story');
      expect(result).toContain('**NÃO** bloqueiam execução');
    });

    it('does not instruct semantic dependency discovery from story body', () => {
      const result = generateUnifiedAgent(completeStory);
      expect(result).not.toContain('Dependências semânticas');
      expect(result).not.toContain('referências a outras stories ou fixes');
      expect(result).not.toContain('padrões `US-*`, `BF-*`, `STORY-*`, `FIX-*`');
      expect(result).not.toContain(
        'campos de texto, critérios de aceite, fora de escopo e infraestrutura',
      );
    });

    it('contains transition protocol', () => {
      const result = generateUnifiedAgent(completeStory);
      expect(result).toContain('PROTOCOLO DE TRANSIÇÃO');
    });

    it('contains return protocol', () => {
      const result = generateUnifiedAgent(completeStory);
      expect(result).toContain('PROTOCOLO DE RETORNO');
    });

    it('contains the inviolable revisor rule', () => {
      const result = generateUnifiedAgent(completeStory);
      expect(result).toContain('REGRA INVIOLÁVEL DO MODO REVISOR');
      expect(result).toContain('NUNCA');
    });

    it('shows dependencies when present', () => {
      const story = storyWithDeps(['US-002', 'US-003']);
      const result = generateUnifiedAgent(story);
      expect(result).toContain('US-002, US-003');
    });

    it('shows "nenhuma" when no dependencies', () => {
      const story = storyWithDeps([]);
      const result = generateUnifiedAgent(story);
      expect(result).toContain('Dependências: nenhuma');
    });

    it('includes gate ordering rule', () => {
      const result = generateUnifiedAgent(completeStory);
      expect(result).toContain('0 → 1 → 2 → 3 → 4');
    });
  });
});

describe('generateImplementadorContent', () => {
  it('returns content without YAML frontmatter', () => {
    const result = generateImplementadorContent(completeStory);
    expect(result).not.toMatch(/^---\n/);
    expect(result).not.toContain('name: speckit-implementador');
  });

  it('starts with heading referencing the story', () => {
    const result = generateImplementadorContent(completeStory);
    expect(result).toMatch(/^# SpecKit Implementador/);
    expect(result).toContain('001');
  });

  it('contains gate markers', () => {
    const result = generateImplementadorContent(completeStory);
    expect(result).toContain('Gate 0');
    expect(result).toContain('Gate 1');
    expect(result).toContain('Gate 2');
  });

  it('contains 80% coverage threshold', () => {
    const result = generateImplementadorContent(completeStory);
    expect(result).toContain('80%');
  });

  it('contains container runtime preflight for Testcontainers and Podman', () => {
    const result = generateImplementadorContent(completeStory);
    expect(result).toContain('Pré-flight para Testcontainers');
    expect(result).toContain('docker info');
    expect(result).toContain('podman machine start');
  });

  it('contains git repository preflight and commit recovery for missing repository', () => {
    const result = generateImplementadorContent(completeStory);
    expect(result).toContain('Setup git resiliente');
    expect(result).toContain('git rev-parse --is-inside-work-tree');
    expect(result).toContain('git init');
    expect(result).toContain('feature/001-<slug>');
    expect(result).toContain('Repita exatamente o mesmo `git add` e o mesmo `git commit`');
    expect(result).toContain('Não execute `git init` para outros erros de commit');
  });

  it('includes acceptance criteria from story', () => {
    const result = generateImplementadorContent(completeStory);
    expect(result).toContain('Botão "Login com GitHub"');
  });

  it('does not throw for empty story', () => {
    expect(() => generateImplementadorContent(emptyStory())).not.toThrow();
  });
});

describe('generateRevisorContent', () => {
  it('returns content without YAML frontmatter', () => {
    const result = generateRevisorContent(completeStory);
    expect(result).not.toMatch(/^---\n/);
    expect(result).not.toContain('name: speckit-revisor');
  });

  it('starts with heading referencing the story', () => {
    const result = generateRevisorContent(completeStory);
    expect(result).toMatch(/^# SpecKit Revisor/);
    expect(result).toContain('001');
  });

  it('contains gate markers', () => {
    const result = generateRevisorContent(completeStory);
    expect(result).toContain('Gate 3');
    expect(result).toContain('Gate 4');
  });

  it('contains checklist dimensions', () => {
    const result = generateRevisorContent(completeStory);
    expect(result).toContain('Funcionalidade');
    expect(result).toContain('Segurança');
    expect(result).toContain('Observabilidade');
  });

  it('does not throw for empty story', () => {
    expect(() => generateRevisorContent(emptyStory())).not.toThrow();
  });
});
