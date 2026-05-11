import { Fix } from '../../fix/Fix';
import { Story } from '../../story/Story';

const BRANCH_WITH_PREFIX_RE =
  /\b(?:feature|fix|hotfix|release|bugfix|chore|support)\/[A-Za-z0-9._/-]+\b/gi;
const GIT_CHECKOUT_RE = /\bgit\s+checkout\s+([A-Za-z0-9._/-]+)\b/gi;
const BRANCH_KEYWORD_RE =
  /\b(?:branch|branches|ramo|ramos|ramificacao|ramificacoes|ramificação|ramificações)\s+(?:atual\s+|citad[ao]s?\s+|do\s+lote\s+|de\s+trabalho\s+)?[`"']?([A-Za-z0-9._/-]+)[`"']?/gi;
const QUOTED_RESERVED_RE = /[`"'](develop|main|master)[`"']/gi;
const STANDALONE_DEVELOP_RE = /\bdevelop\b/gi;

const BRANCH_STOP_WORDS = new Set([
  'branch',
  'branches',
  'ramo',
  'ramos',
  'ramificacao',
  'ramificacoes',
  'ramificação',
  'ramificações',
  'atual',
  'citada',
  'citadas',
  'citado',
  'citados',
]);

function normalizeBranchMention(value: string): string {
  return value
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/[.,;:]+$/g, '');
}

function pushMatch(set: Set<string>, rawValue: string): void {
  const mention = normalizeBranchMention(rawValue);
  if (!mention) return;
  if (BRANCH_STOP_WORDS.has(mention.toLowerCase())) return;
  set.add(mention);
}

function collectMatches(text: string, regex: RegExp, set: Set<string>): void {
  for (const match of text.matchAll(regex)) {
    const value = match[1] ?? match[0];
    if (value) pushMatch(set, value);
  }
}

function aggregateBranchMentions(allMentions: string[][]): string[] {
  const ordered = new Map<string, string>();
  for (const mentions of allMentions) {
    for (const mention of mentions) {
      const key = mention.toLowerCase();
      if (!ordered.has(key)) ordered.set(key, mention);
    }
  }
  return [...ordered.values()];
}

function formatBranchMentions(mentions: string[]): string {
  return mentions.map((mention) => `\`${mention}\``).join(', ');
}

function storyText(story: Story): string {
  return [
    story.metadata.title,
    story.businessRequirement.problem,
    story.businessRequirement.value,
    ...story.businessRequirement.stakeholders,
    ...story.functionalSpec.userStories,
    ...story.functionalSpec.acceptanceCriteria,
    ...story.functionalSpec.outOfScope,
    story.nonFunctionalSpec.performance,
    story.nonFunctionalSpec.security,
    story.nonFunctionalSpec.scalability,
    story.nonFunctionalSpec.usability,
    story.nonFunctionalSpec.availability,
    story.technicalSpec.database,
    story.technicalSpec.infrastructure,
  ]
    .filter(Boolean)
    .join('\n');
}

function fixText(fix: Fix): string {
  return [
    fix.metadata.title,
    fix.bugDescription.title,
    fix.bugDescription.symptoms,
    ...fix.bugDescription.stepsToReproduce,
    fix.bugDescription.environment,
    fix.bugDescription.frequency,
    fix.rootCauseHypothesis.hypothesis,
    ...fix.rootCauseHypothesis.suspectedFiles,
    ...fix.rootCauseHypothesis.suspectedComponents,
    fix.impactAssessment.affectedUsers,
    ...fix.impactAssessment.affectedSystems,
    fix.impactAssessment.regressionRisk,
    ...fix.regressionPrevention.testsToAdd,
    fix.technicalContext.messaging,
    fix.technicalContext.database,
  ]
    .filter(Boolean)
    .join('\n');
}

export interface RuntimeBranchGovernanceOptions {
  mentions: string[];
  defaultSessionBranch: string;
  sessionBranchLabel: string;
  noLoopExample?: string;
}

export interface BatchBranchRuntimeContext {
  strategy: 'session' | 'cited';
  citedMentions: string[];
  sessionBranch?: string;
  sessionBranchSource?: 'current' | 'created';
}

function formatBatchBranchSource(
  source?: BatchBranchRuntimeContext['sessionBranchSource'],
): string {
  if (source === 'created') return 'criada no início deste lote após confirmação do usuário';
  return 'já carregada na sessão atual do VS Code';
}

export function detectBranchMentions(text: string): string[] {
  const mentions = new Set<string>();
  collectMatches(text, BRANCH_WITH_PREFIX_RE, mentions);
  collectMatches(text, GIT_CHECKOUT_RE, mentions);
  collectMatches(text, BRANCH_KEYWORD_RE, mentions);
  collectMatches(text, QUOTED_RESERVED_RE, mentions);
  collectMatches(text, STANDALONE_DEVELOP_RE, mentions);
  return [...mentions];
}

export function detectStoryBranchMentions(story: Story): string[] {
  return detectBranchMentions(storyText(story));
}

export function detectFixBranchMentions(fix: Fix): string[] {
  return detectBranchMentions(fixText(fix));
}

export function detectBatchBranchMentions(stories: Story[]): string[] {
  return aggregateBranchMentions(stories.map((story) => detectStoryBranchMentions(story)));
}

export function generateDraftBranchGovernanceSection(mentions: string[]): string {
  if (mentions.length === 0) return '';

  return `## FASE 0 — Governança de branch (obrigatória quando a ideia cita branch)

A ideia inicial cita branch(es): ${formatBranchMentions(mentions)}.

Antes de iniciar a pergunta 1.1:

1. Pergunte explicitamente ao usuário se deve:
   - respeitar a(s) branch(es) citada(s), ou
   - usar sempre a branch carregada na sessão do VS Code como fonte canônica
2. Se o usuário escolher a branch da sessão, registre essa decisão e trate as branch(es) citada(s) apenas como contexto daqui em diante
3. Se o usuário escolher respeitar branch(es) citada(s) e houver mais de uma, confirme qual delas é a referência canônica
4. Nesta fase de elicitação, **não** procure, não crie e não troque branch — apenas registre a decisão e prossiga para a entrevista
5. Só depois da decisão registrada você pode seguir para a pergunta 1.1

> Se a branch da sessão vier a ser escolhida mais tarde no fluxo de implementação, nenhuma nova citação textual a ${formatBranchMentions(mentions)} pode sobrescrever essa decisão sem nova validação com o usuário.

---

`;
}

export function generateRuntimeBranchGovernanceSection(
  options: RuntimeBranchGovernanceOptions,
): string {
  const { mentions, defaultSessionBranch, sessionBranchLabel, noLoopExample } = options;
  if (mentions.length === 0) return '';

  const formattedMentions = formatBranchMentions(mentions);
  const noLoopLine = noLoopExample
    ? `- Cenário anti-loop obrigatório: se o texto citar ${formattedMentions}, mas ${sessionBranchLabel} já tiver sido definida, permaneça nela e **não** volte a procurar/criar ${noLoopExample} apenas por reaparecer no texto.`
    : `- Depois que ${sessionBranchLabel} estiver definida, nunca volte a procurar/criar ${formattedMentions} só porque a citação reapareceu no texto.`;

  return `## Protocolo de branch citada (aplicar somente porque esta spec cita branch)

Branch(es) citada(s) na spec: ${formattedMentions}

Antes de qualquer \`checkout\`, \`pull\` ou criação de branch:

1. Pergunte ao usuário se deve:
   - respeitar a(s) branch(es) citada(s), ou
   - usar ${sessionBranchLabel} como fonte canônica desta sessão
2. Se o usuário escolher a branch da sessão:
   - se ${sessionBranchLabel} já tiver sido definida, permaneça nela até o fim da sessão
   - se ainda não existir branch de trabalho definida para a sessão, proponha criar \`${defaultSessionBranch}\`, aguarde confirmação e só então a crie
   ${noLoopLine}
3. Se o usuário escolher respeitar branch(es) citada(s):
   - confirme qual branch citada deve prevalecer quando houver mais de uma
   - se a branch confirmada não existir, interrompa e volte ao usuário com o erro; não entre em loop tentando localizar ou criar branch sem nova confirmação explícita

`;
}

export function generateBatchBranchModeMessage(context?: BatchBranchRuntimeContext): string {
  if (context?.strategy === 'session' && context.sessionBranch) {
    return `**Estratégia de branch (modo unificado):** a branch canônica desta sessão/lote é \`${context.sessionBranch}\` (${formatBatchBranchSource(context.sessionBranchSource)}). Não crie branch por story e não permita que citações textuais substituam essa decisão.`;
  }

  if (context?.strategy === 'cited') {
    const formattedMentions =
      context.citedMentions.length > 0
        ? formatBranchMentions(context.citedMentions)
        : 'as branch(es) citada(s)';
    return `**Estratégia de branch (modo unificado):** o usuário escolheu respeitar ${formattedMentions}. Confirme a branch citada aplicável antes de qualquer checkout e não a substitua por uma branch da sessão sem nova validação.`;
  }

  return '**Estratégia de branch (modo unificado):** use uma branch única do lote (ex: `feature/batch-<yyyymmdd>-<slug>`). Não crie branch por story e não empilhe branches de stories.';
}

export function generateBatchBranchModeGuidance(context?: BatchBranchRuntimeContext): string {
  if (context?.strategy === 'session' && context.sessionBranch) {
    const formattedMentions =
      context.citedMentions.length > 0
        ? formatBranchMentions(context.citedMentions)
        : 'qualquer branch citada';
    return [
      `- Use a branch canônica já fixada para esta sessão: \`${context.sessionBranch}\``,
      `- Origem da branch canônica: ${formatBatchBranchSource(context.sessionBranchSource)}`,
      '- Não crie `feature/<story-id>-<slug>` neste modo',
      `- Trate ${formattedMentions} apenas como contexto; elas não podem sobrescrever \`${context.sessionBranch}\` sem nova confirmação`,
    ].join('\n');
  }

  if (context?.strategy === 'cited') {
    const formattedMentions =
      context.citedMentions.length > 0
        ? formatBranchMentions(context.citedMentions)
        : 'branch(es) citada(s)';
    return [
      `- O usuário autorizou respeitar ${formattedMentions}`,
      '- Antes de qualquer checkout por story, confirme qual branch citada se aplica quando houver mais de uma opção',
      '- Não imponha a branch da sessão/lote como padrão sem nova confirmação do usuário',
    ].join('\n');
  }

  return [
    '- Use **uma única branch** para todo o lote (ex: `feature/batch-<yyyymmdd>-<slug>`)',
    '- Não crie `feature/<story-id>-<slug>` neste modo',
    '- Não empilhe branch de uma story sobre outra',
    '- Se a execução iniciar em `develop`/`main`, crie a branch do lote uma vez e reutilize até o fim',
  ].join('\n');
}

export function generateBatchBranchGovernanceSummary(
  stories: Story[],
  context?: BatchBranchRuntimeContext,
): string {
  const mentions =
    context && context.citedMentions.length > 0
      ? context.citedMentions
      : detectBatchBranchMentions(stories);
  if (mentions.length === 0) return '';

  const formattedMentions = formatBranchMentions(mentions);
  if (context?.strategy === 'session' && context.sessionBranch) {
    return `**Governança de branch citada (anti-loop):** o usuário fixou a estratégia "branch da sessão" e a branch canônica deste lote é \`${context.sessionBranch}\`. Trate ${formattedMentions} apenas como contexto; nenhuma citação posterior pode desviar o fluxo para procurar/criar essas branch(es).\n`;
  }

  if (context?.strategy === 'cited') {
    return `**Governança de branch citada:** o usuário autorizou respeitar ${formattedMentions}. Antes de qualquer checkout, confirme qual branch citada vale para a story atual quando houver mais de uma opção; não faça fallback silencioso para a branch da sessão.\n`;
  }

  return `**Governança de branch citada (anti-loop):** se alguma story citar ${formattedMentions}, valide uma única vez no início do lote se essas branch(es) devem ser respeitadas ou se a branch do lote deve continuar canônica. Depois que a branch do lote for criada/fixada, nenhuma citação posterior pode desviar o fluxo para procurar/criar essas branch(es).\n`;
}
