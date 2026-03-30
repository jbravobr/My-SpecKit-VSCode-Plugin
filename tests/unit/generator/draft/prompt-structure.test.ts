/**
 * Prompt Structure Tests — Anti-Loop & Conversation Contract
 *
 * These tests verify structural properties of the elicit prompts that correlate with
 * correct LLM conversational behavior. They are deterministic (no LLM, no VS Code)
 * and serve as regression tests for the loop bugs found in production.
 *
 * What these tests catch that content tests (toContain) cannot:
 *   - Conflicting instructions: "apply without asking" + "never self-answer"
 *   - Missing stop markers after questions
 *   - Phases that auto-advance without user confirmation
 *   - Sections that both derive AND apply without a question gate
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { generateStoryElicitPrompt } from '../../../../src/generator/draft/StoryElicitGenerator';
import { generateFixElicitPrompt } from '../../../../src/generator/draft/FixElicitGenerator';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Counts occurrences of a pattern in a string.
 */
function countOccurrences(text: string, pattern: RegExp | string): number {
  if (typeof pattern === 'string') {
    return text.split(pattern).length - 1;
  }
  return (text.match(pattern) ?? []).length;
}

/**
 * Returns the index of the first occurrence of a string, or -1.
 */
function positionOf(text: string, search: string): number {
  return text.indexOf(search);
}

/**
 * Extracts the content of a named phase section (from its header to the next ## header).
 */
function extractPhase(prompt: string, phaseHeader: string): string {
  const start = prompt.indexOf(phaseHeader);
  if (start === -1) return '';
  const nextPhase = prompt.indexOf('\n## ', start + 1);
  return nextPhase === -1 ? prompt.slice(start) : prompt.slice(start, nextPhase);
}

/**
 * Splits the prompt into phase sections by ## headers.
 */
function extractAllPhases(prompt: string): Array<{ header: string; content: string }> {
  const sections: Array<{ header: string; content: string }> = [];
  const lines = prompt.split('\n');
  let currentHeader = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentHeader) {
        sections.push({ header: currentHeader, content: currentContent.join('\n') });
      }
      currentHeader = line;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentHeader) {
    sections.push({ header: currentHeader, content: currentContent.join('\n') });
  }
  return sections;
}

// ─── Known anti-patterns that cause LLM looping ───────────────────────────────
const ANTI_PATTERNS = [
  // The original Phase 3 instruction that triggered the loop bug
  'aplique os defaults abaixo informando que está fazendo isso',
  // Variations that mean "apply without waiting for user"
  'Pergunte apenas se houver sinais de restrição específica',
  // Auto-advance without question
  'aplique automaticamente sem perguntar',
];

// ─── Required structural markers ──────────────────────────────────────────────
const STOP_MARKERS = [
  'Sua mensagem termina',
  'PARE COMPLETAMENTE',
  'SUA MENSAGEM TERMINA',
  'PARE imediatamente',
];

function hasStopMarker(text: string): boolean {
  return STOP_MARKERS.some(marker => text.includes(marker));
}

// ─────────────────────────────────────────────────────────────────────────────
// Story Prompt Structure Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('StoryElicitPrompt — structural anti-loop properties', () => {
  const roughInput = 'Quero calcular comissão de vendedores baseado em eventos Kafka';
  let prompt: string;

  beforeAll(() => {
    prompt = generateStoryElicitPrompt(roughInput, '001');
  });

  // ── 1. Anti-pattern regression tests ──────────────────────────────────────
  describe('anti-patterns that cause LLM looping (regression)', () => {
    for (const pattern of ANTI_PATTERNS) {
      it(`does not contain "${pattern}"`, () => {
        expect(prompt).not.toContain(pattern);
      });
    }

    it('does not have a phase that instructs to apply defaults before asking any question', () => {
      const phases = extractAllPhases(prompt);
      const fasePhases = phases.filter(p => p.header.startsWith('## FASE'));

      for (const phase of fasePhases) {
        const hasApplyWithoutQuestion =
          phase.content.includes('aplique') &&
          !phase.content.includes('Pergunta para o usuário:') &&
          !phase.content.includes('Pergunta:') &&
          phase.content.includes('sem perguntar');

        expect(hasApplyWithoutQuestion, `Phase "${phase.header}" applies defaults without asking`).toBe(false);
      }
    });

    it('does not use "Avalie automaticamente — não pergunte" for fields requiring user knowledge', () => {
      // 4.4 Target is OK to auto-evaluate (purely technical, derivable from context)
      // But security, DB, infra should never be auto-skipped
      const securitySection = extractPhase(prompt, '### 3.2');
      expect(securitySection).not.toContain('não pergunte');
    });
  });

  // ── 2. REGRA MESTRE position ───────────────────────────────────────────────
  describe('REGRA MESTRE — master rule placement', () => {
    it('REGRA MESTRE is present', () => {
      expect(prompt).toContain('REGRA MESTRE');
    });

    it('REGRA MESTRE appears before FASE 1', () => {
      const regraMestrePos = positionOf(prompt, 'REGRA MESTRE');
      const fase1Pos = positionOf(prompt, '## FASE 1');
      expect(regraMestrePos).toBeGreaterThan(-1);
      expect(regraMestrePos).toBeLessThan(fase1Pos);
    });

    it('REGRA MESTRE states "Uma mensagem = uma pergunta"', () => {
      const regraMestreSection = extractPhase(prompt, '## ⚠️ REGRA MESTRE');
      expect(regraMestreSection).toContain('Uma mensagem');
      expect(regraMestreSection).toContain('uma pergunta');
    });

    it('REGRA MESTRE explicitly prohibits self-answering', () => {
      const regraMestreSection = extractPhase(prompt, '## ⚠️ REGRA MESTRE');
      expect(regraMestreSection).toMatch(/PROIBIDO|NUNCA.*responda.*própria|nunca.*auto-responda/i);
    });
  });

  // ── 3. Phase structure — each phase must have questions and stops ──────────
  describe('phase structure — questions and stop markers', () => {
    const storyPhases = ['## FASE 1', '## FASE 2', '## FASE 3', '## FASE 4', '## FASE 5'];

    for (const phaseHeader of storyPhases) {
      it(`${phaseHeader} is present in the prompt`, () => {
        expect(prompt).toContain(phaseHeader);
      });
    }

    it('FASE 1 has explicit questions for each of its 5 fields', () => {
      const fase1 = extractPhase(prompt, '## FASE 1');
      const questionCount = countOccurrences(fase1, 'Pergunta para o usuário:');
      // 1.1 Problema, 1.2 Por que agora?, 1.3a Valor, 1.3b Métrica, 1.4 Stakeholders = 5
      expect(questionCount).toBeGreaterThanOrEqual(5);
    });

    it('FASE 1 has a stop marker at its summary', () => {
      const fase1 = extractPhase(prompt, '## FASE 1');
      expect(hasStopMarker(fase1)).toBe(true);
    });

    it('FASE 2 has explicit questions for each of its 3 fields', () => {
      const fase2 = extractPhase(prompt, '## FASE 2');
      const questionCount = countOccurrences(fase2, 'Pergunta para o usuário:');
      // 2.1 User Stories, 2.2 Critérios de Aceite, 2.3 Fora de Escopo = 3
      expect(questionCount).toBeGreaterThanOrEqual(3);
    });

    it('FASE 2 has a stop marker at its summary', () => {
      const fase2 = extractPhase(prompt, '## FASE 2');
      expect(hasStopMarker(fase2)).toBe(true);
    });

    it('FASE 3 (NFR) asks each field individually — at least 4 questions (usability skipped for backend context)', () => {
      const fase3 = extractPhase(prompt, '## FASE 3');
      const questionCount = countOccurrences(fase3, 'Pergunta para o usuário:');
      expect(questionCount).toBeGreaterThanOrEqual(4);
    });

    it('FASE 3 (NFR) has a stop marker', () => {
      const fase3 = extractPhase(prompt, '## FASE 3');
      expect(hasStopMarker(fase3)).toBe(true);
    });

    it('FASE 4 has explicit questions for technical fields', () => {
      const fase4 = extractPhase(prompt, '## FASE 4');
      const questionCount = countOccurrences(fase4, 'Pergunta para o usuário:');
      // 4.1 Lang, 4.2 Framework, 4.3 Arch, 4.5 DB, 4.6 Infra = at least 5
      expect(questionCount).toBeGreaterThanOrEqual(5);
    });

    it('FASE 4 has a stop marker at its summary', () => {
      const fase4 = extractPhase(prompt, '## FASE 4');
      expect(hasStopMarker(fase4)).toBe(true);
    });

    it('FASE 5 has at least one explicit question (external dependencies)', () => {
      const fase5 = extractPhase(prompt, '## FASE 5');
      const hasQuestion = fase5.includes('Pergunta para o usuário:');
      expect(hasQuestion).toBe(true);
    });
  });

  // ── 4. Default application contract ───────────────────────────────────────
  describe('default application contract — no silent defaults', () => {
    it('every field-level "Default" instruction is qualified with a condition', () => {
      // Match lines that start with "Default" as an actual field instruction
      // (i.e., "Default (aplique..." or "Default se não informado:").
      // Exclude:
      //   - Lines starting with "**Default**" in bold — these are definitional (Convenções section)
      //   - "Default base" — baseline DoD/DoF items always included regardless
      //   - "Default por linguagem" — cross-reference to another field
      //   - "Default para serviços" — contextual qualifier, not a bare apply
      //   - "Default de fallback" — already conditional by name
      //   - "Default obrigatório" — always-required rule
      const lines = prompt.split('\n');
      const fieldDefaultLines = lines.filter(line => {
        const trimmed = line.trim();
        return (
          trimmed.startsWith('Default') &&
          !trimmed.startsWith('**Default**') &&          // definition in Convenções
          !trimmed.startsWith('Default base') &&          // always-include baseline
          !trimmed.startsWith('Default por linguagem') && // cross-reference
          !trimmed.startsWith('Default para serviços') && // contextual
          !trimmed.startsWith('Default de fallback') &&   // already conditional
          !trimmed.startsWith('Default obrigatório')      // always-required
        );
      });

      for (const line of fieldDefaultLines) {
        const isConditional =
          line.includes('somente após perguntar') ||
          line.includes('aplique somente') ||
          line.includes('se não informado') ||
          line.includes('se não informad');              // partial matches for plurals

        expect(
          isConditional,
          `Unconditional default found: "${line.trim()}"`,
        ).toBe(true);
      }
    });

    it('Modo rápido is the only path that allows applying all defaults at once', () => {
      expect(prompt).toContain('Modo rápido');
      const modoRapido = extractPhase(prompt, '## Modo rápido');
      expect(modoRapido).toContain('preenche tudo com defaults');
    });
  });

  // ── 5. Confirmation question contract ─────────────────────────────────────
  describe('confirmation question contract — phase summaries must stop', () => {
    const confirmationPatterns = ['Está correto?', 'Posso avançar', 'Confirma'];

    for (const confirmText of confirmationPatterns) {
      it(`every flow-level occurrence of "${confirmText}" has a stop marker nearby`, () => {
        // Occurrences in "Regras absolutas" are definitional references — skip them
        const absoluteRulesStart = prompt.indexOf('## Regras absolutas');

        let searchStart = 0;
        while (true) {
          const idx = prompt.indexOf(confirmText, searchStart);
          if (idx === -1) break;

          // Skip references inside Regras absolutas
          if (absoluteRulesStart !== -1 && idx > absoluteRulesStart) {
            searchStart = idx + 1;
            continue;
          }

          // Check 300 chars after the confirmation question for a stop marker
          const surroundingText = prompt.slice(idx, idx + 300);
          const hasStop = hasStopMarker(surroundingText);
          expect(
            hasStop,
            `"${confirmText}" at position ${idx} has no stop marker within 300 chars after it:\n${surroundingText}`,
          ).toBe(true);
          searchStart = idx + 1;
        }
      });
    }
  });

  // ── 6. Absolute rules section ─────────────────────────────────────────────
  describe('regras absolutas — completeness', () => {
    let absoluteRules: string;

    beforeAll(() => {
      absoluteRules = extractPhase(prompt, '## Regras absolutas');
    });

    it('Regras absolutas section is present', () => {
      expect(absoluteRules).not.toBe('');
    });

    it('prohibits self-answering in Regras absolutas', () => {
      expect(absoluteRules).toMatch(/NUNCA.*responda.*própria|nunca.*responda/i);
    });

    it('enforces one question per message in Regras absolutas', () => {
      expect(absoluteRules).toMatch(/uma.*pergunta|UMA.*pergunta/i);
    });

    it('prohibits code implementation in Regras absolutas', () => {
      expect(absoluteRules).toContain('Nunca');
      expect(absoluteRules).toMatch(/implement|código/i);
    });
  });

  // ── 7. Output template completeness ───────────────────────────────────────
  describe('output template — required sections present', () => {
    it('template contains all required markdown sections', () => {
      const requiredSections = [
        '### Requisito de Negócio',
        '### Especificação Funcional',
        '### Especificação Não-Funcional',
        '### Especificação Técnica',
        '### DoR — Definition of Ready',
        '### DoD — Definition of Done',
      ];
      for (const section of requiredSections) {
        expect(prompt).toContain(section);
      }
    });

    it('human DoR criteria are never pre-checked in the template', () => {
      // These must always be [ ] never [x]
      expect(prompt).toContain('- [ ] Requisito de negócio documentado e aprovado pelo stakeholder responsável');
      expect(prompt).toContain('- [ ] DoD acordado com o time de desenvolvimento');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix Prompt Structure Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('FixElicitPrompt — structural anti-loop properties', () => {
  const roughInput = 'O login OAuth2 retorna 500 após expiração do token de refresh';
  let prompt: string;

  beforeAll(() => {
    prompt = generateFixElicitPrompt(roughInput, '001');
  });

  // ── 1. Anti-pattern regression tests ──────────────────────────────────────
  describe('anti-patterns that cause LLM looping (regression)', () => {
    for (const pattern of ANTI_PATTERNS) {
      it(`does not contain "${pattern}"`, () => {
        expect(prompt).not.toContain(pattern);
      });
    }

    it('does not have a phase that applies without asking', () => {
      const phases = extractAllPhases(prompt);
      const fasePhases = phases.filter(p => p.header.startsWith('## FASE'));

      for (const phase of fasePhases) {
        const hasApplyWithoutQuestion =
          phase.content.includes('aplique') &&
          !phase.content.includes('Pergunta para o usuário:') &&
          !phase.content.includes('Pergunta:') &&
          phase.content.includes('sem perguntar');

        expect(hasApplyWithoutQuestion, `Phase "${phase.header}" applies defaults without asking`).toBe(false);
      }
    });
  });

  // ── 2. REGRA MESTRE position ───────────────────────────────────────────────
  describe('REGRA MESTRE — master rule placement', () => {
    it('REGRA MESTRE is present', () => {
      expect(prompt).toContain('REGRA MESTRE');
    });

    it('REGRA MESTRE appears before FASE 1', () => {
      const regraMestrePos = positionOf(prompt, 'REGRA MESTRE');
      const fase1Pos = positionOf(prompt, '## FASE 1');
      expect(regraMestrePos).toBeGreaterThan(-1);
      expect(regraMestrePos).toBeLessThan(fase1Pos);
    });

    it('REGRA MESTRE explicitly prohibits self-answering', () => {
      const regraMestreSection = extractPhase(prompt, '## ⚠️ REGRA MESTRE');
      expect(regraMestreSection).toMatch(/PROIBIDO|NUNCA.*responda.*própria|nunca.*auto-responda/i);
    });
  });

  // ── 3. Phase structure ────────────────────────────────────────────────────
  describe('phase structure — questions and stop markers', () => {
    const fixPhases = [
      '## FASE 1',
      '## FASE 2',
      '## FASE 3',
      '## FASE 4',
      '## FASE 5',
      '## FASE 6',
      '## FASE 7',
    ];

    for (const phaseHeader of fixPhases) {
      it(`${phaseHeader} is present in the prompt`, () => {
        expect(prompt).toContain(phaseHeader);
      });
    }

    it('FASE 1 (Bug Description) has questions for all 8 fields', () => {
      const fase1 = extractPhase(prompt, '## FASE 1');
      const questionCount = countOccurrences(fase1, 'Pergunta para o usuário:');
      // 1.1-1.8 = 8 fields, some combined
      expect(questionCount).toBeGreaterThanOrEqual(7);
    });

    it('FASE 1 has a stop marker at its summary', () => {
      const fase1 = extractPhase(prompt, '## FASE 1');
      expect(hasStopMarker(fase1)).toBe(true);
    });

    it('FASE 2 (Hypothesis) has a stop marker at its summary', () => {
      const fase2 = extractPhase(prompt, '## FASE 2');
      expect(hasStopMarker(fase2)).toBe(true);
    });

    it('FASE 3 (Impact) has questions for severity, affected users, regression risk', () => {
      const fase3 = extractPhase(prompt, '## FASE 3');
      const questionCount = countOccurrences(fase3, 'Pergunta para o usuário:');
      expect(questionCount).toBeGreaterThanOrEqual(3);
    });

    it('FASE 3 has a stop marker at its summary', () => {
      const fase3 = extractPhase(prompt, '## FASE 3');
      expect(hasStopMarker(fase3)).toBe(true);
    });

    it('FASE 5 (Technical Context) has explicit questions — not auto-probe only', () => {
      const fase5 = extractPhase(prompt, '## FASE 5');
      const questionCount = countOccurrences(fase5, 'Pergunta para o usuário:');
      // 5.1 Messaging, 5.2 DB/Cache, 5.3 Dependencies = 3
      expect(questionCount).toBeGreaterThanOrEqual(3);
    });
  });

  // ── 4. Confirmation question contract ─────────────────────────────────────
  describe('confirmation question contract', () => {
    it('every flow-level "Está correto?" has a stop marker within 300 chars', () => {
      // Occurrences in "Regras absolutas" are definitional references (e.g., explaining
      // that the phrase requires user response), not live flow instructions — skip them.
      const absoluteRulesStart = prompt.indexOf('## Regras absolutas');

      let searchStart = 0;
      while (true) {
        const idx = prompt.indexOf('Está correto?', searchStart);
        if (idx === -1) break;

        // Skip references inside Regras absolutas
        if (absoluteRulesStart !== -1 && idx > absoluteRulesStart) {
          searchStart = idx + 1;
          continue;
        }

        const surroundingText = prompt.slice(idx, idx + 300);
        expect(
          hasStopMarker(surroundingText),
          `"Está correto?" at position ${idx} has no stop marker:\n${surroundingText}`,
        ).toBe(true);
        searchStart = idx + 1;
      }
    });
  });

  // ── 5. Regression-specific: partial steps example ─────────────────────────
  describe('known production regression scenarios', () => {
    it('contains a concrete example for partial reproduction steps (prevents vague fallback)', () => {
      expect(prompt).toContain('tempo exato desconhecido');
    });

    it('regression risk field requires level and rationale — not just a to-do', () => {
      expect(prompt).toContain('avaliação com nível e razão');
      expect(prompt).toMatch(/Alto:|Médio:|Baixo:/);
    });

    it('title is proposed AFTER collecting symptoms — prevents premature crystallization', () => {
      const titlePos = positionOf(prompt, '### 1.8 Título do Bug');
      const symptomsPos = positionOf(prompt, '### 1.1 Sintomas');
      expect(symptomsPos).toBeGreaterThan(-1);
      expect(titlePos).toBeGreaterThan(symptomsPos);
    });
  });

  // ── 6. Absolute rules section ─────────────────────────────────────────────
  describe('regras absolutas — completeness', () => {
    it('Regras absolutas section is present', () => {
      expect(prompt).toContain('Regras absolutas');
    });

    it('prohibits self-answering', () => {
      const absoluteRules = extractPhase(prompt, '## Regras absolutas');
      expect(absoluteRules).toMatch(/NUNCA.*responda.*própria|nunca.*responda/i);
    });

    it('reproduction steps explicitly have no acceptable default', () => {
      expect(prompt).toContain('não têm default aceitável');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-prompt consistency tests
// ─────────────────────────────────────────────────────────────────────────────
describe('prompt consistency — story vs fix', () => {
  let storyPrompt: string;
  let fixPrompt: string;

  beforeAll(() => {
    storyPrompt = generateStoryElicitPrompt('Feature X', '001');
    fixPrompt = generateFixElicitPrompt('Bug Y', '001');
  });

  it('both prompts contain REGRA MESTRE', () => {
    expect(storyPrompt).toContain('REGRA MESTRE');
    expect(fixPrompt).toContain('REGRA MESTRE');
  });

  it('both prompts contain Modo rápido escape hatch', () => {
    expect(storyPrompt).toContain('Modo rápido');
    expect(fixPrompt).toContain('Modo rápido');
  });

  it('both prompts contain Regras absolutas section', () => {
    expect(storyPrompt).toContain('Regras absolutas');
    expect(fixPrompt).toContain('Regras absolutas');
  });

  it('both prompts prohibit code implementation', () => {
    expect(storyPrompt).toMatch(/Não escreva código|Nunca.*implement/i);
    expect(fixPrompt).toMatch(/Não escreva código|Nunca.*implement/i);
  });

  it('neither prompt contains known loop-inducing anti-patterns', () => {
    for (const pattern of ANTI_PATTERNS) {
      expect(storyPrompt, `Story prompt contains anti-pattern: "${pattern}"`).not.toContain(pattern);
      expect(fixPrompt, `Fix prompt contains anti-pattern: "${pattern}"`).not.toContain(pattern);
    }
  });
});
