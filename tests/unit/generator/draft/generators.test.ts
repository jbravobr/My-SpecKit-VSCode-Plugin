import { beforeAll, describe, expect, it } from 'vitest';
import { generateFixElicitPrompt } from '../../../../src/generator/draft/FixElicitGenerator';
import { generateStoryElicitPrompt } from '../../../../src/generator/draft/StoryElicitGenerator';

describe('generateStoryElicitPrompt', () => {
  const roughInput = 'Quero calcular comissão de vendedores baseado em eventos Kafka';
  const nextId = '001';
  let result: string;

  beforeAll(() => {
    result = generateStoryElicitPrompt(roughInput, nextId);
  });

  it('contains the rough input verbatim', () => {
    expect(result).toContain(roughInput);
  });

  it('references the correct story ID in file path', () => {
    expect(result).toContain('STORY-001');
    expect(result).toContain('.speckit/STORY-001.md');
  });

  it('contains all 6 phases', () => {
    expect(result).toContain('FASE 1');
    expect(result).toContain('FASE 2');
    expect(result).toContain('FASE 3');
    expect(result).toContain('FASE 4');
    expect(result).toContain('FASE 5');
    expect(result).toContain('FASE 6');
  });

  it('contains "Por que agora?" field for urgency', () => {
    expect(result).toContain('Por que agora');
  });

  it('contains KPI / measurable indicator prompt', () => {
    expect(result).toContain('indicador');
    expect(result).toContain('métr');
  });

  it('warns against "sistema" as user story actor', () => {
    expect(result).toContain('Evite "sistema" como ator');
  });

  it('instructs to derive out-of-scope from context, not generic defaults', () => {
    expect(result).toContain('deriva');
    expect(result).toContain('contexto');
  });

  it('contains async performance exemption rule', () => {
    expect(result).toContain('assíncrono');
    expect(result).toContain('consumer');
  });

  it('contains NFR performance default (P99 < 500ms)', () => {
    expect(result).toContain('P99 < 500ms');
  });

  it('contains NFR availability default with backoff exponencial', () => {
    expect(result).toContain('backoff exponencial');
  });

  it('contains DoR split between AI-verifiable and human-required criteria', () => {
    expect(result).toContain('verificáveis pelo AI');
    expect(result).toContain('requerem ação humana');
  });

  it('does not auto-check human DoR criteria (stakeholder approval, team alignment)', () => {
    expect(result).toContain('aprovado pelo stakeholder responsável');
    expect(result).toContain('DoD acordado com o time');
    // Human criteria must remain unchecked
    expect(result).toContain(
      '- [ ] Requisito de negócio documentado e aprovado pelo stakeholder responsável',
    );
    expect(result).toContain('- [ ] DoD acordado com o time de desenvolvimento');
  });

  it('contains contextual DoD additions based on target/tech', () => {
    expect(result).toContain('Kafka');
    expect(result).toContain('DLQ rate');
    expect(result).toContain('WCAG 2.1');
  });

  it('contains phase summary/confirmation instructions', () => {
    expect(result).toContain('Resumo de fase');
  });

  it('distinguishes "não sei" from "N/A"', () => {
    expect(result).toContain('"Não sei"');
    expect(result).toContain('"N/A"');
  });

  it('contains concrete example of combined problem output', () => {
    expect(result).toContain('Exemplo de Problema combinado');
    expect(result).toContain('ponto de atrito');
  });

  it('always asks about architecture with contextual suggestion', () => {
    expect(result).toContain('Sempre pergunte');
    expect(result).toContain('confirma ou prefere outro');
  });

  it('always asks about auth/public access for security', () => {
    expect(result).toContain('Este serviço será acessado por usuários autenticados');
  });

  it('contains external dependencies field', () => {
    expect(result).toContain('Dependências Externas');
    expect(result).toContain('depende de outra feature');
  });

  it('suggests domain-specific KPI candidate instead of deferring', () => {
    expect(result).toContain('não use "a definir após produção" como default');
    expect(result).toContain('métrica concreta derivada do domínio');
  });

  it('contains acceptance criteria quadrant guidance (limits, null, idempotency)', () => {
    expect(result).toContain('nulo');
    expect(result).toContain('Idempotência');
    expect(result).toContain('Rejeição');
  });

  it('contains story size signal (task vs epic)', () => {
    expect(result).toContain('Sinal de tamanho');
    expect(result).toContain('épico');
    expect(result).toContain('task');
  });

  it('contains scalability as code requirements + infra recommendations', () => {
    expect(result).toContain('Requisitos de código');
    expect(result).toContain('Recomendações de infraestrutura');
    expect(result).toContain('Escalonamento horizontal habilitado');
  });

  it('includes projectStage question in Phase 4', () => {
    expect(result).toContain('4.7 Estágio do Projeto');
    expect(result).toContain('greenfield');
    expect(result).toContain('brownfield');
  });

  it('DoR template uses conditional marking, not hardcoded [x]', () => {
    expect(result).toContain('avalie cada critério individualmente');
    expect(result).not.toMatch(/- \[x\] User stories/);
  });

  it('contains consistent database gap treatment', () => {
    expect(result).toContain('não mencionar banco');
    expect(result).toContain('lacuna identificada');
  });

  it('contains fast mode instruction', () => {
    expect(result).toContain('Modo rápido');
    expect(result).toContain('Campos preenchidos com default');
  });

  it('contains the "Regras absolutas" section', () => {
    expect(result).toContain('Regras absolutas');
  });

  it('contains "UMA pergunta por vez" rule', () => {
    expect(result).toContain('UMA pergunta por vez');
  });

  it('uses a different ID when nextId changes', () => {
    const result002 = generateStoryElicitPrompt(roughInput, '002');
    expect(result002).toContain('STORY-002');
    expect(result002).not.toContain('STORY-001');
  });

  it('includes refactoring context when specType is refactoring', () => {
    const r = generateStoryElicitPrompt(roughInput, '001', 'refactoring');
    expect(r).toContain('Refactoring');
    expect(r).toContain('type: refactoring');
    expect(r).toContain('debt técnico');
  });

  it('includes spike context when specType is spike', () => {
    const r = generateStoryElicitPrompt(roughInput, '001', 'spike');
    expect(r).toContain('Spike');
    expect(r).toContain('type: spike');
    expect(r).toContain('hipótese');
  });

  it('includes workspace defaults context when defaults provided', () => {
    const r = generateStoryElicitPrompt(roughInput, '001', 'story', {
      language: 'java',
      framework: 'springboot',
      projectStage: 'brownfield',
    });
    expect(r).toContain('java');
    expect(r).toContain('springboot');
    expect(r).toContain('brownfield');
    expect(r).toContain('Defaults do workspace');
  });

  it('omits defaults context when defaults is empty', () => {
    const r = generateStoryElicitPrompt(roughInput, '001', 'story', {});
    expect(r).not.toContain('Defaults do workspace');
  });
});

describe('generateFixElicitPrompt', () => {
  const roughInput = 'O login OAuth2 retorna 500 após expiração do token de refresh';
  const nextId = '001';
  let result: string;

  beforeAll(() => {
    result = generateFixElicitPrompt(roughInput, nextId);
  });

  it('contains the rough input verbatim', () => {
    expect(result).toContain(roughInput);
  });

  it('references the correct fix ID in file path', () => {
    expect(result).toContain('FIX-001');
    expect(result).toContain('.speckit/FIX-001.md');
  });

  it('contains Bug Description phase', () => {
    expect(result).toContain('Bug Description');
  });

  it('contains Root Cause Hypothesis phase', () => {
    expect(result).toContain('Root Cause Hypothesis');
  });

  it('contains Impact Assessment phase', () => {
    expect(result).toContain('Impact Assessment');
  });

  it('contains Regression Prevention phase', () => {
    expect(result).toContain('Regression Prevention');
  });

  it('contains DoF — Definition of Fixed', () => {
    expect(result).toContain('Definition of Fixed');
  });

  it('collects symptoms before proposing title', () => {
    const titlePos = result.indexOf('Título do Bug');
    const symptomsPos = result.indexOf('Sintomas');
    expect(symptomsPos).toBeLessThan(titlePos);
  });

  it('contains first occurrence field', () => {
    expect(result).toContain('Primeira Ocorrência');
  });

  it('contains workaround field', () => {
    expect(result).toContain('Workaround');
  });

  it('contains volume quantification in impact assessment', () => {
    expect(result).toContain('Quantos usuários');
    expect(result).toContain('Volume');
  });

  it('does not provide a generic default for reproduction steps', () => {
    expect(result).toContain('não têm default aceitável');
    expect(result).toContain('não reproduzível');
  });

  it('contains contextual DoF additions (DLQ, auth, communication)', () => {
    expect(result).toContain('DLQ');
    expect(result).toContain('Comunicação de resolução');
  });

  it('contains phase summary/confirmation instructions', () => {
    expect(result).toContain('Resumo de fase');
  });

  it('distinguishes "não sei" from "N/A"', () => {
    expect(result).toContain('"Não sei"');
    expect(result).toContain('"N/A"');
  });

  it('merges hypothesis and suspected files into a single integrated question', () => {
    expect(result).toContain('Onde você acha que está o problema e por quê');
    expect(result).toContain('hipótese');
    expect(result).toContain('localização');
  });

  it('separately extracts suspectedFiles and suspectedComponents', () => {
    expect(result).toContain('suspectedFiles');
    expect(result).toContain('suspectedComponents');
  });

  it('expands technical context to cover cache and load balancer signals', () => {
    expect(result).toContain('Redis');
    expect(result).toContain('TTL');
    expect(result).toContain('cache miss');
  });

  it('actively probes technical context based on symptom signals', () => {
    expect(result).toContain('Pergunte se qualquer um destes sinais');
  });

  it('contains external dependencies field for fix prerequisites', () => {
    expect(result).toContain('Dependências Externas');
    expect(result).toContain('Pré-requisitos para a correção');
  });

  it('contains urgency / deadline field for fix prioritization', () => {
    expect(result).toContain('Urgência / Prazo');
    expect(result).toContain('SLA contratual');
  });

  it('cross-validates severity with workaround from field 1.5', () => {
    expect(result).toContain('Antes de perguntar');
    expect(result).toContain('cruze com o dado já coletado em 1.5');
  });

  it('regression risk requires level and rationale, not just a task', () => {
    expect(result).toContain('avaliação com nível e razão');
    expect(result).toContain('Alto:');
    expect(result).toContain('Baixo:');
  });

  it('handles partial reproduction steps explicitly', () => {
    expect(result).toContain('parcialmente conhecidos');
    expect(result).toContain('tempo exato desconhecido');
  });

  it('contains fast mode instruction', () => {
    expect(result).toContain('Modo rápido');
    expect(result).toContain('Campos preenchidos com default');
  });

  it('contains the "Regras absolutas" section', () => {
    expect(result).toContain('Regras absolutas');
  });

  it('contains "UMA pergunta por vez" rule', () => {
    expect(result).toContain('UMA pergunta por vez');
  });

  it('contains Montagem Final phase', () => {
    expect(result).toContain('Montagem Final');
  });

  it('uses a different ID when nextId changes', () => {
    const result002 = generateFixElicitPrompt(roughInput, '002');
    expect(result002).toContain('FIX-002');
    expect(result002).not.toContain('FIX-001');
  });
});
