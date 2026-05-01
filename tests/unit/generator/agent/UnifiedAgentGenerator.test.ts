import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  generateImplementadorContent,
  generateImplementadorContentForUnified,
} from '../../../../src/generator/agent/StoryImplementadorAgentGenerator';
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

    it('enforces single shared batch branch strategy in unified mode', () => {
      const result = generateUnifiedAgent(completeStory);
      expect(result).toContain('PROTOCOLO DE BRANCH (modo batch unificado)');
      expect(result).toContain('uma única branch de integração do lote');
      expect(result).toContain('Não criar branch por story');
      expect(result).toContain('Não empilhar story branch sobre story branch');
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
      expect(result).toContain('Finalize commit local pendente do Gate 2');
      expect(result).toContain('git status --porcelain');
      expect(result).toContain('test(001): fechamento do gate 2');
      expect(result).toContain('Handoff: IMPLEMENTADOR → REVISOR');
      expect(result).toContain('@speckit /review-auto');
      expect(result).toContain('@speckit /review-auto --changes-requested');
      expect(result).toContain('@speckit /review-auto --approved');
      expect(result).toContain('Sem aguardar novo comando do usuário');
      expect(result).toContain('Proibido encerrar a resposta somente com handoff');
    });

    it('enforces markdown formatting and explicit gate transition block in chat responses', () => {
      const result = generateUnifiedAgent(completeStory);
      expect(result).toContain('FORMATO OBRIGATÓRIO NO CHAT (MARKDOWN)');
      expect(result).toContain('## 🚪 Transição de Gate/Status');
      expect(result).toContain('Status');
      expect(result).toContain('Evidências');
      expect(result).toContain('Próximo passo');
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

    it('keeps review handoff inside the same unified agent', () => {
      const result = generateUnifiedAgent(completeStory);
      expect(result).toContain('Handoff interno para revisão');
      expect(result).toContain('Não encerre a sessão.');
      expect(result).toContain('Não selecione outro agente neste ponto.');
      expect(result).toContain('gate: 3');
      expect(result).toContain('status: review');
      expect(result).not.toContain(
        'Para iniciar a revisão independente, o usuário deve selecionar',
      );
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

  it('requires markdown response formatting in implementador mode', () => {
    const result = generateImplementadorContent(completeStory);
    expect(result).toContain('Formato obrigatório de resposta no chat (Markdown)');
    expect(result).toContain('Template rápido (use em toda interação)');
    expect(result).toContain('Status');
    expect(result).toContain('Plano da Etapa');
    expect(result).toContain('Validação');
    expect(result).toContain('Evidências');
    expect(result).toContain('Próximo passo');
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

  it('returns unified closure section for unified flow', () => {
    const result = generateImplementadorContentForUnified(completeStory);
    expect(result).toContain('Handoff interno para revisão');
    expect(result).toContain('Não encerre a sessão.');
    expect(result).toContain('modo batch unificado — branch única do lote');
    expect(result).toContain('Não crie `feature/001-<slug>`');
    expect(result).toContain('Não crie branch por story');
    expect(result).toContain('Finalize commit local pendente do Gate 2');
    expect(result).toContain('@speckit /review-auto');
    expect(result).toContain('Sem aguardar novo comando do usuário');
    expect(result).toContain('Gate atualizado: 2 → 3');
    expect(result).toContain('Status atualizado: in-progress/open → review');
    expect(result).not.toContain('Para iniciar a revisão independente, o usuário deve selecionar');
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

  it('requires markdown response formatting in revisor mode', () => {
    const result = generateRevisorContent(completeStory);
    expect(result).toContain('Formato obrigatório de resposta no chat (Markdown)');
    expect(result).toContain('Template rápido (use em toda interação)');
    expect(result).toContain('Status');
    expect(result).toContain('Evidências');
    expect(result).toContain('Veredito');
    expect(result).toContain('Veredito/Próximo passo');
  });

  it('does not require asking for coverage when evidence already exists in current session', () => {
    const result = generateRevisorContent(completeStory);
    expect(result).toContain(
      'Se o relatório da Sessão A já foi emitido nesta sessão, reutilize essa evidência e prossiga',
    );
    expect(result).toContain(
      'Se não houver evidência disponível no contexto, solicite ao usuário o relatório de cobertura da Sessão A',
    );
  });

  it('does not throw for empty story', () => {
    expect(() => generateRevisorContent(emptyStory())).not.toThrow();
  });

  it('uses batch unified git checklist when requested', () => {
    const result = generateRevisorContent(completeStory, { mode: 'batch-unified' });
    expect(result).toContain('Branch atual é a branch única do lote');
    expect(result).toContain('Nenhuma branch por story foi criada neste fluxo batch');
    expect(result).toContain('Não houve empilhamento de branch entre stories');
    expect(result).toContain('branch única do lote');
  });
});
