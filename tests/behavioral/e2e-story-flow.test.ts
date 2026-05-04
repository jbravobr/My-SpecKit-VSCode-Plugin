/**
 * E2E Behavioral Tests — Full Story Generation Pipeline
 *
 * These tests simulate the complete /draft → interview → STORY-NNN.md → /validate pipeline
 * using the real Anthropic API. They validate that:
 *   1. The generated document can be parsed by StoryParser
 *   2. The parsed story passes StoryValidator (no structural gaps)
 *   3. All required sections are populated (not empty, not TODO placeholders)
 *
 * Two strategies tested:
 *   - Fast path ("modo rápido"): single call, LLM fills all defaults
 *   - Full interview: autonomous multi-turn loop with scripted user answers
 *
 * Cost: ~$0.10–0.15 per full run
 * Model: claude-haiku-4-5 (cheapest adequate model)
 * Timeout: 120s (full interview takes 60–90s with 15+ turns)
 */

import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { generateStoryElicitPrompt } from '../../src/generator/draft/StoryElicitGenerator';
import { parseStory } from '../../src/story/StoryParser';
import { validateStory } from '../../src/story/StoryValidator';

// ─── Setup ─────────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SKIP = !ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5';

const client = SKIP ? null : new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const ROUGH_INPUT = 'Calcular comissão de vendedores baseado em eventos Kafka';
const storyPrompt = generateStoryElicitPrompt(ROUGH_INPUT, '001');

// ─── Helpers ────────────────────────────────────────────────────────────────

type Message = { role: 'user' | 'assistant'; content: string };

async function sendMessage(
  messages: Message[],
  systemPrompt: string = storyPrompt,
): Promise<string> {
  if (!client) throw new Error('No API key');
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * Extracts the markdown content block from the LLM response.
 * The LLM wraps the STORY file in a ```markdown ... ``` block.
 */
function extractMarkdown(response: string): string | null {
  // Try fenced markdown block first
  const fenced = response.match(/```(?:markdown)?\s*\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Try raw metadata block (sometimes LLM omits the fence)
  const raw = response.match(/(<!--\s*metadata[\s\S]*?###\s*DoD[^\n]*\n[\s\S]*?)(?:```|$)/);
  if (raw) return raw[1].trim();

  return null;
}

/**
 * Runs the complete interview loop with scripted user answers.
 * Sends answers one at a time until the LLM generates the STORY file.
 */
async function runFullInterview(answers: string[], maxTurns = 40): Promise<string | null> {
  const messages: Message[] = [{ role: 'user', content: 'Iniciar' }];
  let answerIndex = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await sendMessage(messages);
    messages.push({ role: 'assistant', content: response });

    // Check if the LLM generated the final STORY file
    const markdown = extractMarkdown(response);
    if (markdown && markdown.includes('<!-- metadata')) {
      return markdown;
    }

    // Also check if response is the confirmation message after file generation
    if (/STORY-\d+\.md.*criado|criado.*STORY-\d+\.md/i.test(response)) {
      // The markdown might have been in a previous response — return what we have
      const lastMarkdown = messages
        .filter((m) => m.role === 'assistant')
        .map((m) => extractMarkdown(m.content))
        .filter(Boolean)
        .pop();
      if (lastMarkdown) return lastMarkdown;
    }

    // Provide the next scripted answer
    const answer = answers[answerIndex] ?? 'Sim';
    answerIndex++;
    messages.push({ role: 'user', content: answer });
  }

  return null;
}

// ─── Scripted answers for the full interview ────────────────────────────────
//
// These are generic enough to work regardless of exact question phrasing.
// Order follows the interview phases (1→2→3→4→5→6).

const SCRIPTED_ANSWERS = [
  // Phase 1 — Business context
  'Vendedores não têm visibilidade de comissões em tempo real. O cálculo é feito em batch D+1.',
  'O time comercial cresceu 40% e reclamações de divergência triplicaram.',
  'Vendedores verão comissões em tempo real após cada venda.',
  'Redução de 80% nas reclamações de suporte sobre comissões.',
  'Time comercial, time de produto, sistemas de BI.',
  'Sim.', // title confirmation
  'Sim.', // phase 1 summary confirmation

  // Phase 2 — Functional spec
  'Como vendedor, quero ver minha comissão calculada em tempo real após cada venda. Como sistema de BI, quero receber eventos de comissão calculada.',
  'Consumir evento Kafka venda.concluida. Calcular comissão conforme tabela. Persistir resultado. Emitir evento comissao.calculada. Garantir idempotência.',
  'Cálculo de bônus anuais. Interface de gestão de regras. Relatórios de auditoria.',
  'Sim.', // phase 2 summary confirmation

  // Phase 3 — NFR (one question per field)
  'Processamento assíncrono via Kafka — latência não se aplica, monitorar lag.',
  'Sistemas internos via token de serviço.',
  'Volume esperado: ~10k eventos/hora no pico.',
  'Não há interface de usuário, N/A.',
  '99,9% uptime, sem RTO específico definido.',
  'Sim.', // phase 3 summary confirmation

  // Phase 4 — Technical spec
  'TypeScript.',
  'other',
  'hexagonal',
  'Sim.', // phase 4 summary confirmation

  // Phase 5 — DoD
  'Aceito os critérios base. Adicionar: monitoramento de offset lag e DLQ rate.',

  // Fallback answers for any unexpected questions
  'Sim.',
  'Sim.',
  'Sim.',
  'Sim.',
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)('E2E — Story generation pipeline', () => {
  it(
    'fast path: "modo rápido" generates a story that passes StoryValidator',
    { timeout: 60_000 },
    async () => {
      const messages: Message[] = [{ role: 'user', content: 'modo rápido' }];
      const response = await sendMessage(messages);

      // Extract the generated markdown
      const markdown = extractMarkdown(response);
      expect(
        markdown,
        `LLM did not generate a markdown block.\nResponse:\n${response}`,
      ).not.toBeNull();

      // Parse the generated story
      const story = parseStory(markdown!);

      // Assert all required fields are populated
      expect(story.metadata.title, 'title missing').toBeTruthy();
      expect(story.businessRequirement.problem, 'problem missing').toBeTruthy();
      expect(story.businessRequirement.value, 'value missing').toBeTruthy();
      expect(story.businessRequirement.stakeholders.length, 'no stakeholders').toBeGreaterThan(0);
      expect(story.functionalSpec.userStories.length, 'no user stories').toBeGreaterThan(0);
      expect(
        story.functionalSpec.acceptanceCriteria.length,
        'no acceptance criteria',
      ).toBeGreaterThan(0);
      expect(story.nonFunctionalSpec.performance, 'performance missing').toBeTruthy();
      expect(story.nonFunctionalSpec.security, 'security missing').toBeTruthy();
      expect(story.technicalSpec.language, 'language missing').toBeTruthy();
      expect(story.technicalSpec.architecture, 'architecture missing').toBeTruthy();
      expect(story.dod.criteria.length, 'no DoD criteria').toBeGreaterThan(0);

      // Run the validator — should have no structural gaps
      const result = validateStory(story);
      const structuralGaps = result.gaps.filter((g) => g.section !== 'DoR');
      expect(
        structuralGaps,
        `Structural gaps found:\n${structuralGaps.map((g) => `  [${g.section}] ${g.message}`).join('\n')}`,
      ).toHaveLength(0);
    },
  );

  it(
    'full interview: autonomous multi-turn flow produces a valid story',
    { timeout: 240_000 },
    async () => {
      const markdown = await runFullInterview(SCRIPTED_ANSWERS);

      expect(markdown, 'LLM never generated the STORY file after 40 turns').not.toBeNull();

      // Parse the generated story
      const story = parseStory(markdown!);

      // Assert all required fields are populated
      expect(story.metadata.title, 'title missing').toBeTruthy();
      expect(story.businessRequirement.problem, 'problem missing').toBeTruthy();
      expect(story.businessRequirement.value, 'value missing').toBeTruthy();
      expect(story.businessRequirement.stakeholders.length, 'no stakeholders').toBeGreaterThan(0);
      expect(story.functionalSpec.userStories.length, 'no user stories').toBeGreaterThan(0);
      expect(
        story.functionalSpec.acceptanceCriteria.length,
        'no acceptance criteria',
      ).toBeGreaterThan(0);
      expect(story.nonFunctionalSpec.performance, 'performance missing').toBeTruthy();
      expect(story.nonFunctionalSpec.security, 'security missing').toBeTruthy();
      expect(story.technicalSpec.language, 'language missing').toBeTruthy();
      expect(story.technicalSpec.architecture, 'architecture missing').toBeTruthy();
      expect(story.dod.criteria.length, 'no DoD criteria').toBeGreaterThan(0);

      // Run the validator — should have no structural gaps
      const result = validateStory(story);
      const structuralGaps = result.gaps.filter((g) => g.section !== 'DoR');
      expect(
        structuralGaps,
        `Structural gaps found:\n${structuralGaps.map((g) => `  [${g.section}] ${g.message}`).join('\n')}`,
      ).toHaveLength(0);

      // DoR: human-only criteria are expected unchecked — that's correct behavior
      // But AI-verifiable criteria should be checked if data was collected
      const aiVerifiable = result.dorStatus.filter(
        (d) =>
          !d.criterion.includes('aprovado pelo stakeholder') &&
          !d.criterion.includes('acordado com o time'),
      );
      const checkedAiVerifiable = aiVerifiable.filter((d) => d.checked).length;
      expect(
        checkedAiVerifiable,
        `Expected some AI-verifiable DoR criteria to be checked.\nDoR status:\n${result.dorStatus.map((d) => `  [${d.checked ? 'x' : ' '}] ${d.criterion}`).join('\n')}`,
      ).toBeGreaterThan(0);
    },
  );
});

describe.skipIf(!SKIP)('E2E — skipped (no API key)', () => {
  it('requires ANTHROPIC_API_KEY to run E2E tests', () => {
    console.info('\n[e2e] Skipped: set ANTHROPIC_API_KEY to run E2E story generation tests.');
  });
});
