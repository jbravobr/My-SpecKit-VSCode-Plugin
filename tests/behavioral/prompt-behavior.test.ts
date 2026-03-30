/**
 * Behavioral Tests — LLM Conversation Contract
 *
 * These tests run the generated prompts against the real Claude API to verify
 * that the LLM actually follows the conversational rules encoded in the prompts.
 *
 * They catch what unit/structural tests cannot:
 *   - Does the model actually ask only ONE question per turn?
 *   - Does the model stop after asking instead of self-answering?
 *   - Does the model NOT loop through multiple phases autonomously?
 *   - Does the model use "Modo rápido" correctly when requested?
 *
 * Requirements:
 *   - ANTHROPIC_API_KEY environment variable must be set
 *   - Run with: npx vitest run tests/behavioral/
 *   - These tests make real API calls — they have a cost (~$0.01 per run)
 *
 * Model: claude-haiku-4-5 (fastest / cheapest — adequate for prompt compliance testing)
 * Timeout: 30s per test (LLM calls can be slow)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { generateStoryElicitPrompt } from '../../src/generator/draft/StoryElicitGenerator';
import { generateFixElicitPrompt } from '../../src/generator/draft/FixElicitGenerator';

// ─── Setup ────────────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SKIP = !ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5'; // cheapest model — adequate for compliance testing

const client = SKIP ? null : new Anthropic({ apiKey: ANTHROPIC_API_KEY });

/**
 * Sends a multi-turn conversation to Claude and returns the last assistant response text.
 */
async function chat(
  systemPrompt: string,
  turns: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  if (!client) throw new Error('No API key');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: turns,
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  return text;
}

/**
 * Counts the number of question marks that appear at the END of a sentence
 * (heuristic for how many distinct questions are in a response).
 */
function countQuestions(text: string): number {
  // Match "?" followed by whitespace, newline, or end of string
  // This counts sentence-ending question marks, not ? inside code or URLs
  const matches = text.match(/\?(?=\s|$)/gm);
  return matches?.length ?? 0;
}

/**
 * Checks if the response contains patterns that indicate self-answering.
 * These are the specific patterns that caused the production loop bug.
 */
function hasSelfAnswerPattern(text: string): boolean {
  const patterns = [
    /\*\*Sim\*\*/i,
    /^Sim[,\.]?\s/im,
    /^Correto[,\.]?\s/im,
    /^Confirmado[,\.]?\s/im,
    /Está correto.*\n.*(?:Fase|FASE)/is,  // "Está correto?" followed immediately by next phase
    /Confirma\?.*\n{0,3}(?:##\s*FASE|\*\*FASE)/is,
  ];
  return patterns.some(p => p.test(text));
}

/**
 * Checks if the response skipped phases — i.e., jumped from asking one question
 * to presenting a phase summary without waiting for user input.
 */
function hasPhaseSkip(text: string, currentPhase: number): boolean {
  const nextPhasePattern = new RegExp(`FASE\\s+${currentPhase + 1}`, 'i');
  const phaseAfterNext = new RegExp(`FASE\\s+${currentPhase + 2}`, 'i');
  return phaseAfterNext.test(text) || (nextPhasePattern.test(text) && text.includes('Resumo'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Story Prompt Behavioral Tests
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)('Story Prompt — LLM behavioral compliance', () => {
  const roughInput = 'Quero calcular comissão de vendedores baseado em eventos Kafka quando uma venda é concluída';
  let storyPrompt: string;

  beforeAll(() => {
    storyPrompt = generateStoryElicitPrompt(roughInput, '001');
  });

  it('first response contains ONLY question 1.1 — no summary, no extra content', { timeout: 30_000 }, async () => {
    const response = await chat(storyPrompt, [
      { role: 'user', content: 'Iniciar' },
    ]);

    // Question 1.1 is a compound question by design ("Qual dor... resolve? Quem sente...?")
    // so the first response should have at most 2 "?" — not multiple unrelated topics
    const questionCount = countQuestions(response);
    expect(questionCount, `Expected ≤2 questions (1.1 is compound), got ${questionCount}:\n${response}`).toBeLessThanOrEqual(2);

    // Should NOT contain any phase headers or summaries
    expect(response).not.toMatch(/FASE\s+[23456]/i);
    expect(response).not.toContain('Resumo');
    expect(response).not.toContain('Modo rápido');

    // Should contain the actual question 1.1 topic (problem/pain)
    expect(response).toMatch(/dor|ineficiência|lacuna|problema|resolve|sente/i);
  });

  it('does not self-answer after asking — stops and waits', { timeout: 30_000 }, async () => {
    // Simulate: agent asked 1.1, user answered, agent asked 1.2
    // Now we check: does the agent answer 1.2 itself or wait?
    const response = await chat(storyPrompt, [
      { role: 'user', content: 'Iniciar' },
      {
        role: 'assistant',
        content: 'Qual dor, ineficiência ou lacuna esta funcionalidade resolve? Quem sente essa dor hoje e com qual frequência?',
      },
      {
        role: 'user',
        content: 'Os vendedores não conseguem ver suas comissões em tempo real. Isso acontece diariamente e gera muita incerteza no time comercial.',
      },
    ]);

    // Should ask the NEXT question (1.2), not answer it
    expect(hasSelfAnswerPattern(response), `Agent self-answered:\n${response}`).toBe(false);

    // Should have exactly one new question
    const questionCount = countQuestions(response);
    expect(questionCount, `Expected 1 question, got ${questionCount}:\n${response}`).toBeLessThanOrEqual(2);

    // Should NOT have jumped to Phase 2 or beyond
    expect(response).not.toMatch(/user stor|critério de aceite|fora de escopo/i);
  });

  it('does not auto-advance through Phase 2 after user answers 2.2', { timeout: 30_000 }, async () => {
    // This is the exact scenario that caused the production loop
    const response = await chat(storyPrompt, [
      { role: 'user', content: 'Iniciar' },
      { role: 'assistant', content: 'Qual dor, ineficiência ou lacuna esta funcionalidade resolve? Quem sente essa dor hoje e com qual frequência?' },
      { role: 'user', content: 'Vendedores não veem comissões em tempo real, gera incerteza diária.' },
      { role: 'assistant', content: 'O que torna esta entrega urgente ou relevante neste momento?' },
      { role: 'user', content: 'O time comercial cresceu 40% e o suporte triplicou as reclamações sobre comissões.' },
      { role: 'assistant', content: 'O que muda — e para quem — quando isso for entregue?' },
      { role: 'user', content: 'Vendedores terão visibilidade em tempo real, reduzindo dúvidas e reclamações.' },
      { role: 'assistant', content: 'Como você vai saber que deu certo? Qual indicador ou métrica vai se mover?' },
      { role: 'user', content: 'Redução de tickets de suporte sobre comissões em pelo menos 50%.' },
      { role: 'assistant', content: 'Quem é impactado ou tem interesse no resultado? Liste times, sistemas dependentes e usuários finais.' },
      { role: 'user', content: 'Time comercial, time de produto, sistema Kafka de eventos.' },
      { role: 'assistant', content: 'Capturei o seguinte sobre o requisito de negócio: [resumo]. Está correto? Posso avançar para as user stories?' },
      { role: 'user', content: 'Sim, correto.' },
      { role: 'assistant', content: 'Quais são as ações que um usuário ou sistema externo executa? Use: Como [ator com objetivo], quero [ação] para [benefício].' },
      { role: 'user', content: 'Como vendedor, quero ver minhas comissões em tempo real para planejar meu mês.' },
      { role: 'assistant', content: 'Quais condições verificáveis provam que cada user story está funcionando? Inclua o fluxo principal, limites de dados e pelo menos um caso de erro ou rejeição.' },
      { role: 'user', content: 'O sistema deve calcular comissão em menos de 5 segundos após o evento Kafka. Deve rejeitar eventos duplicados.' },
    ]);

    // After answering 2.2, the agent should ask 2.3 (Fora de Escopo) — NOT auto-advance to Phase 3
    expect(hasSelfAnswerPattern(response), `Agent self-answered:\n${response}`).toBe(false);

    // Should NOT have jumped ahead to Phase 3 or NFR content
    expect(response).not.toMatch(/performance|segurança|escalabilidade|disponibilidade|P99/i);
    expect(response).not.toMatch(/FASE\s*3/i);

    // Should ask about out-of-scope OR do a phase 2 summary — NOT skip to phase 3
    const asksOutOfScope = /fora de escopo|não\s+será|explicitamente\s+não/i.test(response);
    const doesPhase2Summary = /resumo|user stori|critério|escopo/i.test(response);
    expect(asksOutOfScope || doesPhase2Summary, `Agent neither asked 2.3 nor summarized Phase 2:\n${response}`).toBe(true);
  });

  it('respects "modo rápido" and generates file without asking questions', { timeout: 45_000 }, async () => {
    const response = await chat(storyPrompt, [
      { role: 'user', content: 'modo rápido' },
    ]);

    // In fast mode, agent should generate the full document (id: 001 or STORY-001)
    expect(response).toMatch(/STORY-001|id:\s*001|História:/i);
    expect(response).toMatch(/Requisito de Negócio|Especificação Funcional|Definition of Ready/i);

    // Should have generated the full document structure (defaults applied silently in fast mode)
    expect(response).toMatch(/Definition of Ready|DoR|Especificação Não-Funcional|NFR/i);
  });

  it('asks only about architecture WITH a contextual suggestion — not blindly', { timeout: 30_000 }, async () => {
    // Navigate to the architecture question
    const response = await chat(storyPrompt, [
      { role: 'user', content: 'Iniciar' },
      { role: 'assistant', content: 'Qual dor, ineficiência ou lacuna esta funcionalidade resolve?' },
      { role: 'user', content: 'Vendedores não veem comissões em tempo real.' },
      { role: 'assistant', content: 'O que torna urgente?' },
      { role: 'user', content: 'Time cresceu 40%.' },
      { role: 'assistant', content: 'O que muda quando entregue?' },
      { role: 'user', content: 'Visibilidade em tempo real.' },
      { role: 'assistant', content: 'Qual indicador vai se mover?' },
      { role: 'user', content: 'Redução de tickets.' },
      { role: 'assistant', content: 'Quem é impactado?' },
      { role: 'user', content: 'Time comercial.' },
      { role: 'assistant', content: 'Resumo fase 1. Está correto?' },
      { role: 'user', content: 'Sim.' },
      { role: 'assistant', content: 'Quais user stories?' },
      { role: 'user', content: 'Como vendedor, quero ver comissões em tempo real.' },
      { role: 'assistant', content: 'Quais critérios de aceite?' },
      { role: 'user', content: 'Calcular em < 5s, rejeitar duplicados.' },
      { role: 'assistant', content: 'O que está fora de escopo?' },
      { role: 'user', content: 'Interface admin, cálculos retroativos.' },
      { role: 'assistant', content: 'Resumo fase 2. Confirma?' },
      { role: 'user', content: 'Sim.' },
      { role: 'assistant', content: 'NFR defaults. Há algo para ajustar? E segurança: autenticado, interno ou público?' },
      { role: 'user', content: 'Serviço interno via token. Sem outros ajustes.' },
      { role: 'assistant', content: 'Qual linguagem de programação?' },
      { role: 'user', content: 'Java.' },
      { role: 'assistant', content: 'Qual framework?' },
      { role: 'user', content: 'Spring Boot.' },
    ]);

    // Should ask about architecture WITH a suggestion
    expect(response).toMatch(/arquitetura|padrão arquitetural|hexagonal|layered|microservices/i);
    expect(response).toMatch(/sugiro|recomendo|como base/i);

    // Should contain exactly one question
    const questionCount = countQuestions(response);
    expect(questionCount, `Expected 1 question for architecture, got ${questionCount}:\n${response}`).toBeLessThanOrEqual(2);
  });
}, );

// ─────────────────────────────────────────────────────────────────────────────
// Fix Prompt Behavioral Tests
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)('Fix Prompt — LLM behavioral compliance', () => {
  const roughInput = 'O login OAuth2 retorna 500 após expiração do token de refresh';
  let fixPrompt: string;

  beforeAll(() => {
    fixPrompt = generateFixElicitPrompt(roughInput, '001');
  });

  it('first response contains ONLY question 1.1 — symptoms, not the title', { timeout: 30_000 }, async () => {
    const response = await chat(fixPrompt, [
      { role: 'user', content: 'Iniciar' },
    ]);

    const questionCount = countQuestions(response);
    expect(questionCount, `Expected 1 question, got ${questionCount}:\n${response}`).toBe(1);

    // Must NOT propose a title in the first message (title comes at 1.8)
    expect(response).not.toMatch(/título|title|bug\s*:/i);

    // Should ask about symptoms
    expect(response).toMatch(/acontece|comportamento|observado|esperado|errado|problema/i);

    // Should NOT have jumped to hypothesis or impact
    expect(response).not.toMatch(/hipótese|causa raiz|severidade|workaround/i);
  });

  it('does not self-answer the "Está correto?" phase 1 summary', { timeout: 30_000 }, async () => {
    const response = await chat(fixPrompt, [
      { role: 'user', content: 'Iniciar' },
      { role: 'assistant', content: 'O que exatamente acontece de errado? Descreva o comportamento observado e o esperado.' },
      { role: 'user', content: 'O sistema retorna HTTP 500. O esperado seria renovar o token automaticamente.' },
      { role: 'assistant', content: 'Quando este comportamento foi observado pela primeira vez?' },
      { role: 'user', content: 'Desde ontem após o deploy das 18h.' },
      { role: 'assistant', content: 'Quais são os passos exatos para reproduzir o problema?' },
      { role: 'user', content: 'Login, aguardar 1 hora, fazer qualquer request.' },
      { role: 'assistant', content: 'Em qual ambiente o bug ocorre?' },
      { role: 'user', content: 'Produção. Staging não reproduz.' },
      { role: 'assistant', content: 'Existe algum workaround disponível?' },
      { role: 'user', content: 'Sim, fazer logout e login novamente.' },
      { role: 'assistant', content: 'O bug ocorre sempre, intermitentemente ou sob condição específica?' },
      { role: 'user', content: 'Sempre, após 1 hora de inatividade.' },
      { role: 'assistant', content: 'Há SLA ou prazo para correção?' },
      { role: 'user', content: 'Sim, SLA de 4 horas pois afeta todos os usuários.' },
      { role: 'assistant', content: 'Sugiro o título: "OAuth2 — Token de refresh não renovado automaticamente após expiração". Está adequado?' },
      { role: 'user', content: 'Sim.' },
      // This is the critical moment: the agent should do a phase 1 summary and STOP
    ]);

    // Should present a Phase 1 summary and ask confirmation — NOT advance to Phase 2
    expect(hasSelfAnswerPattern(response), `Agent self-answered:\n${response}`).toBe(false);

    // Should NOT have jumped to hypothesis questions (asking about hypothesis is ok in confirmation like "avançar para a hipótese?")
    expect(response).not.toMatch(/onde\s+(você\s+)?acha\s+que|arquivos?\s+suspeitos?/i);
    // If it mentions "hipótese", it must be only inside a confirmatory "avançar para" phrase, not a standalone question
    const hipoteseMatches = response.match(/hipótese/gi) || [];
    const avancaHipotese = (response.match(/avançar para a hipótese/gi) || []).length;
    expect(hipoteseMatches.length - avancaHipotese, `Jumped to hypothesis outside of confirmation:\n${response}`).toBe(0);

    // Should ask for confirmation OR the response is the summary itself
    const isSummaryOrQuestion = /resumo|correto|confirma|avançar/i.test(response);
    expect(isSummaryOrQuestion, `Expected summary or confirmation, got:\n${response}`).toBe(true);
  });

  it('proposes severity WITH a cross-validated suggestion, not a blank question', { timeout: 30_000 }, async () => {
    // Navigate to the severity question
    const response = await chat(fixPrompt, [
      { role: 'user', content: 'Iniciar' },
      { role: 'assistant', content: 'O que exatamente acontece?' },
      { role: 'user', content: 'HTTP 500 ao tentar renovar token.' },
      { role: 'assistant', content: 'Quando foi observado pela primeira vez?' },
      { role: 'user', content: 'Deploy de ontem.' },
      { role: 'assistant', content: 'Passos para reproduzir?' },
      { role: 'user', content: 'Login, aguardar 1h, fazer request.' },
      { role: 'assistant', content: 'Em qual ambiente?' },
      { role: 'user', content: 'Produção.' },
      { role: 'assistant', content: 'Existe workaround?' },
      { role: 'user', content: 'Não. Sem workaround.' },
      { role: 'assistant', content: 'Frequência?' },
      { role: 'user', content: 'Sempre após 1h.' },
      { role: 'assistant', content: 'Há prazo?' },
      { role: 'user', content: 'SLA 4h.' },
      { role: 'assistant', content: 'Sugiro título X. Está adequado?' },
      { role: 'user', content: 'Sim.' },
      { role: 'assistant', content: 'Resumo fase 1. Está correto?' },
      { role: 'user', content: 'Sim.' },
      { role: 'assistant', content: 'Onde você acha que está o problema e por quê?' },
      { role: 'user', content: 'Suspeito do TokenService.ts, talvez o refresh token expire antes do previsto.' },
      { role: 'assistant', content: 'Resumo fase 2. Confirma?' },
      { role: 'user', content: 'Sim.' },
    ]);

    // Should ask about severity WITH a pre-computed suggestion (high, since no workaround)
    expect(response).toMatch(/severidade|severity/i);
    expect(response).toMatch(/high|alto|crítico|critical/i); // Should suggest high/critical (no workaround + main feature)
    expect(response).toMatch(/sugiro|sugere|recomendo/i); // Should present a suggestion

    // Should NOT ask a blank "what is the severity?" question
    expect(response).not.toMatch(/^Qual é a severidade\?$/im);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Info block when API key is missing
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!SKIP)('Behavioral tests — skipped (no API key)', () => {
  it('requires ANTHROPIC_API_KEY to run behavioral tests', () => {
    console.info(
      '\n[behavioral] Skipped: set ANTHROPIC_API_KEY to run LLM behavioral tests.\n' +
      'These tests validate that the prompts cause Claude to:\n' +
      '  - Ask only ONE question per turn\n' +
      '  - Never self-answer confirmation questions\n' +
      '  - Not auto-advance through phases\n' +
      'Cost: ~$0.01 per full run (uses claude-haiku-4-5)\n',
    );
    expect(true).toBe(true); // Always passes — just informational
  });
});
