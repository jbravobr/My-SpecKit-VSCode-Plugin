import * as path from 'path';
import * as vscode from 'vscode';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { extractSpecType } from '../../parser/BaseParser';
import { Gate, SpecStatus } from '../../story/Story';
import { parseStory } from '../../story/StoryParser';
import { AuditLogger } from '../../workflow/AuditLogger';
import { emitCommandTelemetry } from '../../workflow/CommandTelemetry';
import { validateGateTransition, validateStatusTransition } from '../../workflow/GateEnforcer';
import { gitOps, IGitOps } from '../../workflow/GitOperations';
import { upsertMetadataFields } from '../../workflow/MetadataPatcher';
import { createCorrelationId } from '../../workflow/ObservabilityContext';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import {
  consumeTransitionIntent,
  createTransitionIntent,
  getBatchSessionConsent,
  setBatchSessionConsent,
} from '../../workflow/TransitionGovernance';
import { requireWorkspace } from './CommandHelpers';

interface CoverageInfo {
  percent?: number;
  linesHit: number;
  linesFound: number;
}

type MetadataPatchResult = import('../../workflow/MetadataPatcher').MetadataPatchResult;

type ReviewAutoAction = 'orchestrate' | 'approved' | 'changes-requested';

interface ReviewAutoControl {
  action: ReviewAutoAction;
  auto: boolean;
  batchConsent: boolean;
  confirmIntentId?: string;
  error?: string;
}

interface StoryTransitionSummary {
  fromGate: Gate;
  toGate: Gate;
  fromStatus: SpecStatus;
  toStatus: SpecStatus;
  changed: boolean;
  reason: string;
}

function upsertStoryMetadata(content: string, gate: Gate, status: SpecStatus): MetadataPatchResult {
  return upsertMetadataFields(content, { gate, status });
}

function extractChangedFilesFromDiff(diffOutput: string): string[] {
  const re = /^diff --git a\/(.+?) b\/(.+)$/gm;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = re.exec(diffOutput)) !== null) {
    const candidate = (match[2] || '').trim();
    if (candidate) seen.add(candidate);
  }

  return [...seen];
}

async function collectChangedFiles(workspaceRoot: string, git: IGitOps): Promise<string[]> {
  if (git.changedFiles) {
    try {
      const againstDevelop = await git.changedFiles(workspaceRoot, 'develop...HEAD');
      if (againstDevelop.length > 0) return againstDevelop;
    } catch {
      // ignore and fallback
    }

    try {
      const againstHead = await git.changedFiles(workspaceRoot, 'HEAD');
      if (againstHead.length > 0) return againstHead;
    } catch {
      // ignore and fallback
    }
  }

  try {
    const fullDiff = await git.diff(workspaceRoot, true);
    return extractChangedFilesFromDiff(fullDiff);
  } catch {
    return [];
  }
}

function parseCoverageFromLcov(content: string): CoverageInfo {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let linesFound = 0;
  let linesHit = 0;

  for (const line of lines) {
    if (line.startsWith('LF:')) {
      linesFound += Number.parseInt(line.slice(3), 10) || 0;
      continue;
    }
    if (line.startsWith('LH:')) {
      linesHit += Number.parseInt(line.slice(3), 10) || 0;
    }
  }

  if (linesFound <= 0) return { linesFound, linesHit };
  const percent = (linesHit / linesFound) * 100;
  return { linesFound, linesHit, percent };
}

async function readCoverageEvidence(workspaceRoot: string, fs: IFileSystem): Promise<CoverageInfo> {
  const lcovPath = path.join(workspaceRoot, 'coverage', 'lcov.info');
  const exists = await fs.fileExists(lcovPath);
  if (!exists) return { linesFound: 0, linesHit: 0 };
  const content = await fs.readFile(lcovPath);
  return parseCoverageFromLcov(content);
}

function formatCoverage(coverage: CoverageInfo): string {
  if (coverage.percent === undefined) {
    return 'não disponível (lcov ausente ou inválido)';
  }
  return `${coverage.percent.toFixed(2)}% (${coverage.linesHit}/${coverage.linesFound})`;
}

function readFlagValue(tokens: string[], flag: string): string | undefined {
  const normalized = flag.toLowerCase();

  for (let idx = 0; idx < tokens.length; idx += 1) {
    const token = tokens[idx];
    if (token === normalized) {
      const next = tokens[idx + 1];
      if (next && !next.startsWith('--')) return next;
      return undefined;
    }

    if (token.startsWith(`${normalized}=`)) {
      return token.slice(normalized.length + 1).trim();
    }
  }

  return undefined;
}

function parseReviewAutoControl(prompt: string | undefined): ReviewAutoControl {
  const tokens = (prompt ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);

  const approved = tokens.includes('--approved') || tokens.includes('--approve');
  const changesRequested =
    tokens.includes('--changes-requested') ||
    tokens.includes('--changes') ||
    tokens.includes('--rework');
  const auto = tokens.includes('--auto');
  const batchConsent = tokens.includes('--batch-consent');
  const confirmIntentId = readFlagValue(tokens, '--confirm');

  if (tokens.includes('--confirm') && !confirmIntentId) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      error: 'Use `--confirm <intent-id>` para confirmar uma transição pendente.',
    };
  }

  if (approved && changesRequested) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      error:
        'Flags conflitantes: use apenas uma entre `--approved` e `--changes-requested` no comando `/review-auto`.',
    };
  }

  if (batchConsent && (approved || changesRequested)) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      error:
        'Use `--batch-consent` isoladamente para consentimento de sessão batch ou execute transição separadamente.',
    };
  }

  if (auto && batchConsent) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      error: 'Flags incompatíveis: `--auto` não pode ser combinado com `--batch-consent`.',
    };
  }

  if (approved) return { action: 'approved', auto, batchConsent, confirmIntentId };
  if (changesRequested) {
    return { action: 'changes-requested', auto, batchConsent, confirmIntentId };
  }
  return { action: 'orchestrate', auto, batchConsent, confirmIntentId };
}

function applyStoryTransition(
  content: string,
  fromGate: Gate,
  fromStatus: SpecStatus,
  toGate: Gate,
  toStatus: SpecStatus,
  reason: string,
): { patch: MetadataPatchResult; summary: StoryTransitionSummary } {
  if (fromGate !== toGate) {
    const gateValidation = validateGateTransition(fromGate, toGate);
    if (!gateValidation.allowed) {
      throw new Error(
        `Transição automática de gate bloqueada (${fromGate} → ${toGate}): ${gateValidation.reason ?? 'motivo não informado'}`,
      );
    }
  }

  if (fromStatus !== toStatus) {
    const statusValidation = validateStatusTransition(fromStatus, toStatus);
    if (!statusValidation.allowed) {
      throw new Error(
        `Transição automática de status bloqueada (${fromStatus} → ${toStatus}): ${statusValidation.reason ?? 'motivo não informado'}`,
      );
    }
  }

  const patch = upsertStoryMetadata(content, toGate, toStatus);
  return {
    patch,
    summary: {
      fromGate,
      toGate,
      fromStatus,
      toStatus,
      changed: patch.changed,
      reason,
    },
  };
}

function formatTransitionMarkdown(summary: StoryTransitionSummary): string {
  if (!summary.changed) {
    return (
      `### 🚪 Transição de Gate/Status\n` +
      `- ℹ️ Sem mudança persistida (gate/status já estavam no estado esperado).\n` +
      `- Motivo: ${summary.reason}\n`
    );
  }

  return (
    `### 🚪 Transição de Gate/Status\n` +
    `| Campo | Antes | Depois |\n` +
    `| --- | --- | --- |\n` +
    `| Gate | \`${summary.fromGate}\` | \`${summary.toGate}\` |\n` +
    `| Status | \`${summary.fromStatus}\` | \`${summary.toStatus}\` |\n` +
    `\n` +
    `**Motivo:** ${summary.reason}\n`
  );
}

interface ReviewAutoRecordInput {
  command: string;
  outcome: string;
  detail?: string;
  gate: Gate;
  commandExecutionId: string;
  specId: string;
  specTitle: string;
  workspaceRoot: string;
  fs: IFileSystem;
  audit: AuditLogger;
  tracer: TraceabilityManager;
}

async function recordReviewAutoEvent(input: ReviewAutoRecordInput): Promise<void> {
  await emitCommandTelemetry({
    workspaceRoot: input.workspaceRoot,
    fs: input.fs,
    audit: input.audit,
    tracer: input.tracer,
    command: input.command,
    outcome: input.outcome,
    detail: input.detail,
    commandExecutionId: input.commandExecutionId,
    specId: input.specId,
    specTitle: input.specTitle,
    specType: 'story',
    gate: input.gate,
    llmResponseReceived: true,
    traceType: 'custom',
    traceDescription: `review-auto event: ${input.outcome}`,
  });
}

interface TransitionProposal {
  toGate: Gate;
  toStatus: SpecStatus;
  reason: string;
  commandLabel: string;
}

function buildTransitionProposal(action: ReviewAutoAction): TransitionProposal | undefined {
  if (action === 'approved') {
    return {
      toGate: 4,
      toStatus: 'done',
      reason: 'Veredito APROVADO confirmado no Gate 3.',
      commandLabel: '/review-auto --approved',
    };
  }

  if (action === 'changes-requested') {
    return {
      toGate: 2,
      toStatus: 'in-progress',
      reason: 'Veredito ALTERAÇÕES SOLICITADAS no Gate 3.',
      commandLabel: '/review-auto --changes-requested',
    };
  }

  return {
    toGate: 3,
    toStatus: 'review',
    reason: 'Handoff implementador → revisor orquestrado automaticamente.',
    commandLabel: '/review-auto',
  };
}

function formatTransitionProposalMarkdown(
  storyId: string,
  intentId: string,
  fromGate: Gate,
  toGate: Gate,
  fromStatus: SpecStatus,
  toStatus: SpecStatus,
  reason: string,
  confirmCommand: string,
): string {
  return (
    `## ⚠️ Confirmação obrigatória de transição — STORY-${storyId}\n\n` +
    `### 🚪 Transição de Gate/Status (proposta)\n` +
    `| Campo | Antes | Depois |\n` +
    `| --- | --- | --- |\n` +
    `| Gate | \`${fromGate}\` | \`${toGate}\` |\n` +
    `| Status | \`${fromStatus}\` | \`${toStatus}\` |\n\n` +
    `**Motivo:** ${reason}\n\n` +
    `Intent-ID: \`${intentId}\`\n\n` +
    `Para confirmar explicitamente, execute:\n` +
    `- \`${confirmCommand}\`\n\n` +
    `Sem esta confirmação, nenhuma alteração de gate/status será persistida.\n`
  );
}

function formatBatchConsentProposalMarkdown(intentId: string): string {
  return (
    '## ⚠️ Consentimento único obrigatório — sessão batch unificada\n\n' +
    'Este consentimento autoriza handoffs automáticos **somente** nesta sessão do batch.\n\n' +
    `Intent-ID: \`${intentId}\`\n\n` +
    'Para confirmar explicitamente, execute:\n' +
    `- \`@speckit /review-auto --batch-consent --confirm ${intentId}\`\n\n` +
    'Sem este consentimento, qualquer transição com `--auto` será bloqueada.\n'
  );
}

export async function handleReviewAutoCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  workspace: IWorkspace = vscodeWorkspace,
  fs: IFileSystem = vscodeFileSystem,
  git: IGitOps = gitOps,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;
  const workspaceRootPath = workspaceRoot;

  const commandExecutionId = createCorrelationId('exec');
  const audit = new AuditLogger(workspaceRootPath, fs);
  const tracer = new TraceabilityManager(workspaceRootPath, fs);

  const activeSpecPath = await workspace.getActiveSpecPath();
  if (!activeSpecPath) {
    await emitCommandTelemetry({
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
      command: '/review-auto',
      outcome: '⛔ bloqueado: nenhuma spec ativa',
      detail: 'Seleção de story ativa é obrigatória para revisão automática.',
      commandExecutionId,
      specId: 'GLOBAL-REVIEW-AUTO',
      specTitle: 'Review Auto Command',
      specType: 'story',
      llmResponseReceived: true,
    });

    stream.markdown(
      '❌ Nenhuma spec ativa encontrada. Execute `@speckit /status` e selecione uma story em andamento.\n',
    );
    return;
  }
  const activeStoryPath = activeSpecPath;

  const content = await fs.readFile(activeStoryPath);
  const specType = extractSpecType(content);
  if (specType !== 'story') {
    await emitCommandTelemetry({
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
      command: '/review-auto',
      outcome: '⛔ bloqueado: tipo de spec não suportado',
      detail: `Tipo detectado: ${specType}`,
      commandExecutionId,
      specId: 'GLOBAL-REVIEW-AUTO',
      specTitle: 'Review Auto Command',
      specType: 'story',
      llmResponseReceived: true,
    });

    stream.markdown('❌ `/review-auto` está disponível apenas para Story no momento.\n');
    return;
  }

  const story = parseStory(content);
  const control = parseReviewAutoControl(request.prompt);

  if (control.error) {
    await recordReviewAutoEvent({
      command: '/review-auto',
      outcome: '❌ comando bloqueado por parâmetros inválidos',
      detail: control.error,
      gate: story.metadata.gate,
      commandExecutionId,
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
    });

    stream.markdown(
      `❌ ${control.error}\n\n` +
        '**Uso suportado:**\n' +
        '- `@speckit /review-auto` (orquestra Gate 2 → Gate 3 e revisão automática)\n' +
        '- `@speckit /review-auto --changes-requested` (Gate 3 → Gate 2 para retrabalho)\n' +
        '- `@speckit /review-auto --approved` (Gate 3 → Gate 4 com status done)\n' +
        '- `@speckit /review-auto --batch-consent` (propõe consentimento único da sessão batch)\n' +
        '- `@speckit /review-auto --confirm <intent-id>` (confirma transição pendente)\n',
    );
    return;
  }

  if (control.batchConsent) {
    if (!control.confirmIntentId) {
      const consentIntent = await createTransitionIntent(workspaceRootPath, fs, {
        kind: 'batch-consent',
        command: '/review-auto --batch-consent',
        payload: {
          specId: story.metadata.id,
          specTitle: story.metadata.title,
        },
        ttlMinutes: 30,
      });

      await recordReviewAutoEvent({
        command: '/review-auto --batch-consent',
        outcome: '⏳ consentimento batch pendente de confirmação explícita',
        detail: `Intent-ID: ${consentIntent.id}`,
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(formatBatchConsentProposalMarkdown(consentIntent.id));
      return;
    }

    const consentIntent = await consumeTransitionIntent(
      workspaceRootPath,
      fs,
      control.confirmIntentId,
      'batch-consent',
    );

    if (!consentIntent) {
      await recordReviewAutoEvent({
        command: '/review-auto --batch-consent',
        outcome: '❌ consentimento batch bloqueado (intent inválido/expirado)',
        detail: `Intent-ID: ${control.confirmIntentId}`,
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        `❌ Intent-ID inválido ou expirado: \`${control.confirmIntentId}\`. Gere um novo consentimento com \`@speckit /review-auto --batch-consent\`.\n`,
      );
      return;
    }

    const consent = await setBatchSessionConsent(workspaceRootPath, fs, {
      commandExecutionId,
      note: `Batch consent confirmed from intent ${consentIntent.id}`,
      ttlMinutes: 240,
    });

    await recordReviewAutoEvent({
      command: '/review-auto --batch-consent',
      outcome: '✅ consentimento único de sessão batch habilitado',
      detail: `Consent-ID: ${consent.id}`,
      gate: story.metadata.gate,
      commandExecutionId,
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
    });

    stream.markdown(
      '✅ Consentimento único da sessão batch registrado com sucesso.\n\n' +
        'Agora comandos com `--auto` podem executar handoffs automáticos durante esta sessão.\n',
    );
    return;
  }

  if (story.metadata.status === 'done' || story.metadata.status === 'cancelled') {
    await recordReviewAutoEvent({
      command: '/review-auto',
      outcome: '⛔ bloqueado: status terminal',
      detail: `Status atual: ${story.metadata.status}`,
      gate: story.metadata.gate,
      commandExecutionId,
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
    });

    stream.markdown(
      `❌ Story \`${story.metadata.id}\` já está em status terminal (\`${story.metadata.status}\`). Revisão automática não aplicável.\n`,
    );
    return;
  }

  if (control.auto) {
    const batchConsent = await getBatchSessionConsent(workspaceRootPath, fs);
    if (!batchConsent) {
      await recordReviewAutoEvent({
        command: '/review-auto --auto',
        outcome: '⛔ bloqueado: consentimento batch ausente',
        detail:
          'Execute /review-auto --batch-consent e confirme explicitamente antes de usar --auto.',
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        '❌ Transição automática bloqueada: consentimento único da sessão batch não encontrado.\n\n' +
          'Execute e confirme:\n' +
          '- `@speckit /review-auto --batch-consent`\n',
      );
      return;
    }
  }

  async function proposeOrApplyTransition(
    proposal: TransitionProposal,
  ): Promise<{ summary?: StoryTransitionSummary; applied: boolean }> {
    const confirmCommand = `@speckit /review-auto --confirm`;

    if (!control.auto && !control.confirmIntentId) {
      const intent = await createTransitionIntent(workspaceRootPath, fs, {
        kind: 'gate-transition',
        command: proposal.commandLabel,
        payload: {
          specId: story.metadata.id,
          fromGate: String(story.metadata.gate),
          toGate: String(proposal.toGate),
          fromStatus: story.metadata.status,
          toStatus: proposal.toStatus,
          reason: proposal.reason,
        },
        ttlMinutes: 30,
      });

      await recordReviewAutoEvent({
        command: proposal.commandLabel,
        outcome: '⏳ transição proposta aguardando confirmação explícita',
        detail: `Intent-ID: ${intent.id}`,
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        formatTransitionProposalMarkdown(
          story.metadata.id,
          intent.id,
          story.metadata.gate,
          proposal.toGate,
          story.metadata.status,
          proposal.toStatus,
          proposal.reason,
          `${confirmCommand} ${intent.id}`,
        ),
      );
      return { applied: false };
    }

    let toGate = proposal.toGate;
    let toStatus = proposal.toStatus;
    let reason = proposal.reason;

    if (!control.auto && control.confirmIntentId) {
      const intent = await consumeTransitionIntent(
        workspaceRootPath,
        fs,
        control.confirmIntentId,
        'gate-transition',
      );
      if (!intent) {
        await recordReviewAutoEvent({
          command: proposal.commandLabel,
          outcome: '❌ confirmação rejeitada: intent inválido/expirado',
          detail: `Intent-ID: ${control.confirmIntentId}`,
          gate: story.metadata.gate,
          commandExecutionId,
          specId: story.metadata.id,
          specTitle: story.metadata.title,
          workspaceRoot: workspaceRootPath,
          fs,
          audit,
          tracer,
        });

        stream.markdown(
          `❌ Intent-ID inválido ou expirado: \`${control.confirmIntentId}\`. Gere nova proposta de transição e confirme novamente.\n`,
        );
        return { applied: false };
      }

      const intentSpecId = intent.payload.specId;
      const intentFromGate = Number.parseInt(intent.payload.fromGate ?? '', 10);
      const intentFromStatus = intent.payload.fromStatus as SpecStatus;
      if (
        intentSpecId !== story.metadata.id ||
        intentFromGate !== story.metadata.gate ||
        intentFromStatus !== story.metadata.status
      ) {
        await recordReviewAutoEvent({
          command: proposal.commandLabel,
          outcome: '❌ confirmação rejeitada: estado da story divergiu da proposta',
          detail:
            `Intent-ID: ${intent.id}\n` +
            `Esperado: gate ${intent.payload.fromGate}, status ${intent.payload.fromStatus}\n` +
            `Atual: gate ${story.metadata.gate}, status ${story.metadata.status}`,
          gate: story.metadata.gate,
          commandExecutionId,
          specId: story.metadata.id,
          specTitle: story.metadata.title,
          workspaceRoot: workspaceRootPath,
          fs,
          audit,
          tracer,
        });

        stream.markdown(
          '❌ A story mudou após a proposta de transição. Gere uma nova proposta e confirme novamente para manter rastreabilidade consistente.\n',
        );
        return { applied: false };
      }

      toGate = Number.parseInt(intent.payload.toGate ?? '', 10) as Gate;
      toStatus = intent.payload.toStatus as SpecStatus;
      reason = intent.payload.reason ?? proposal.reason;
    }

    const { patch, summary } = applyStoryTransition(
      content,
      story.metadata.gate,
      story.metadata.status,
      toGate,
      toStatus,
      reason,
    );

    if (patch.changed) {
      await fs.writeFile(activeStoryPath, patch.content);
    }

    return { applied: true, summary };
  }

  if (control.action === 'approved') {
    if (story.metadata.gate !== 3) {
      await recordReviewAutoEvent({
        command: '/review-auto --approved',
        outcome: '⛔ bloqueado: gate inválido para encerramento',
        detail: `Gate atual: ${story.metadata.gate}. Gate esperado: 3.`,
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. O encerramento automático exige Gate 3 com revisão concluída.\n`,
      );
      return;
    }

    try {
      const proposal = buildTransitionProposal('approved');
      if (!proposal) {
        stream.markdown('❌ Não foi possível montar a proposta de transição de aprovação.\n');
        return;
      }

      const transitioned = await proposeOrApplyTransition(proposal);
      if (!transitioned.applied || !transitioned.summary) return;

      const summary = transitioned.summary;

      if (summary.toGate !== 4 || summary.toStatus !== 'done') {
        stream.markdown(
          '❌ A confirmação recebida não representa encerramento para Gate 4/status done.\n',
        );
        return;
      }

      await recordReviewAutoEvent({
        command: '/review-auto --approved',
        outcome: '✅ Veredito APROVADO — story encerrada no Gate 4',
        detail: `Gate: ${summary.fromGate} -> ${summary.toGate}\nStatus: ${summary.fromStatus} -> ${summary.toStatus}`,
        gate: 4,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        `## ✅ Encerramento Orquestrado — STORY-${story.metadata.id}\n\n` +
          `${formatTransitionMarkdown(summary)}\n\n` +
          '### Próximo passo\n' +
          `- Faça o commit do metadata da story: \`git add .speckit/STORY-${story.metadata.id}.md\`\n` +
          `- Conclua com: \`git commit -m "chore(${story.metadata.id}): encerra story no speckit"\`\n`,
      );
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`❌ ${msg}\n`);
      return;
    }
  }

  if (control.action === 'changes-requested') {
    if (story.metadata.gate !== 3) {
      await recordReviewAutoEvent({
        command: '/review-auto --changes-requested',
        outcome: '⛔ bloqueado: gate inválido para retorno ao retrabalho',
        detail: `Gate atual: ${story.metadata.gate}. Gate esperado: 3.`,
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. O retorno para retrabalho exige Gate 3.\n`,
      );
      return;
    }

    try {
      const proposal = buildTransitionProposal('changes-requested');
      if (!proposal) {
        stream.markdown('❌ Não foi possível montar a proposta de retorno para retrabalho.\n');
        return;
      }

      const transitioned = await proposeOrApplyTransition(proposal);
      if (!transitioned.applied || !transitioned.summary) return;

      const summary = transitioned.summary;

      if (summary.toGate !== 2 || summary.toStatus !== 'in-progress') {
        stream.markdown(
          '❌ A confirmação recebida não representa retorno ao Gate 2/status in-progress.\n',
        );
        return;
      }

      await recordReviewAutoEvent({
        command: '/review-auto --changes-requested',
        outcome: '🔄 Alterações solicitadas — retorno para Gate 2 (implementação)',
        detail: `Gate: ${summary.fromGate} -> ${summary.toGate}\nStatus: ${summary.fromStatus} -> ${summary.toStatus}`,
        gate: 2,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(
        `## 🔄 Retorno Orquestrado para Retrabalho — STORY-${story.metadata.id}\n\n` +
          `${formatTransitionMarkdown(summary)}\n\n` +
          '### Próximo passo\n' +
          '- Retorne ao modo implementador e aplique apenas os FIXes aprovados no plano de revisão.\n' +
          '- Após concluir os FIXes e revalidar testes/cobertura, execute `@speckit /review-auto` para novo ciclo de revisão.\n',
      );
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`❌ ${msg}\n`);
      return;
    }
  }

  if (story.metadata.gate < 2) {
    await recordReviewAutoEvent({
      command: '/review-auto',
      outcome: '⛔ bloqueado: gate abaixo do mínimo para revisão',
      detail: `Gate atual: ${story.metadata.gate}`,
      gate: story.metadata.gate,
      commandExecutionId,
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
    });

    stream.markdown(
      `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. A revisão automática exige conclusão prévia dos Gates 0-2.\n`,
    );
    return;
  }

  if (story.metadata.gate > 3) {
    await recordReviewAutoEvent({
      command: '/review-auto',
      outcome: '⛔ bloqueado: gate acima da janela de revisão',
      detail: `Gate atual: ${story.metadata.gate}`,
      gate: story.metadata.gate,
      commandExecutionId,
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      workspaceRoot: workspaceRootPath,
      fs,
      audit,
      tracer,
    });

    stream.markdown(
      `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. Para novos ciclos de revisão, retorne antes ao Gate 2 via fluxo de correções.\n`,
    );
    return;
  }

  let transitionSummary: StoryTransitionSummary = {
    fromGate: story.metadata.gate,
    toGate: story.metadata.gate,
    fromStatus: story.metadata.status,
    toStatus: story.metadata.status,
    changed: false,
    reason: 'Story já estava em modo de revisão (gate/status preservados).',
  };

  if (story.metadata.gate === 2 || story.metadata.status !== 'review') {
    try {
      const proposal = buildTransitionProposal('orchestrate');
      if (!proposal) {
        stream.markdown('❌ Não foi possível montar a proposta de handoff para revisão.\n');
        return;
      }

      const transitioned = await proposeOrApplyTransition(proposal);
      if (!transitioned.applied || !transitioned.summary) return;
      transitionSummary = transitioned.summary;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await recordReviewAutoEvent({
        command: '/review-auto',
        outcome: '❌ erro ao aplicar transição para Gate 3',
        detail: msg,
        gate: story.metadata.gate,
        commandExecutionId,
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        workspaceRoot: workspaceRootPath,
        fs,
        audit,
        tracer,
      });

      stream.markdown(`❌ ${msg}\n`);
      return;
    }
  }

  const changedFiles = await collectChangedFiles(workspaceRootPath, git);
  const coverage = await readCoverageEvidence(workspaceRootPath, fs);

  const blockers: string[] = [];
  if (changedFiles.length === 0) {
    blockers.push(
      'Nenhum arquivo foi detectado automaticamente no diff para revisão. Valide o range da branch (ex.: develop...HEAD).',
    );
  }
  if (coverage.percent === undefined) {
    blockers.push(
      'Evidência de cobertura não encontrada (coverage/lcov.info ausente ou inválido).',
    );
  } else if (coverage.percent < 80) {
    blockers.push(
      `Cobertura abaixo do mínimo obrigatório: ${coverage.percent.toFixed(2)}% < 80.00%.`,
    );
  }

  const filesSection =
    changedFiles.length > 0
      ? changedFiles.map((f) => `- \`${f}\``).join('\n')
      : '- (nenhum arquivo detectado automaticamente)';

  const blockerSection =
    blockers.length > 0
      ? blockers.map((b) => `- ❌ ${b}`).join('\n')
      : '- ✅ Nenhum bloqueio automático detectado';

  const verdict =
    blockers.length > 0
      ? 'ALTERAÇÕES SOLICITADAS (bloqueios automáticos)'
      : 'REVISÃO GATE 3 EXECUTADA (sem bloqueios automáticos)';

  await recordReviewAutoEvent({
    command: '/review-auto',
    outcome: `✅ ${verdict}`,
    detail:
      `Gate: ${transitionSummary.fromGate} -> ${transitionSummary.toGate}\n` +
      `Status: ${transitionSummary.fromStatus} -> ${transitionSummary.toStatus}\n` +
      `Arquivos detectados: ${changedFiles.length}\n` +
      `Cobertura: ${formatCoverage(coverage)}\n` +
      `Bloqueios: ${blockers.length}`,
    gate: 3,
    commandExecutionId,
    specId: story.metadata.id,
    specTitle: story.metadata.title,
    workspaceRoot: workspaceRootPath,
    fs,
    audit,
    tracer,
  });

  stream.markdown(
    `## ✅ Revisão Orquestrada — STORY-${story.metadata.id}\n\n` +
      `${formatTransitionMarkdown(transitionSummary)}\n\n` +
      `### Evidências coletadas\n` +
      `- Arquivos detectados para revisão: ${changedFiles.length}\n` +
      `- Cobertura detectada: ${formatCoverage(coverage)}\n\n` +
      `**Arquivos candidatos à revisão**\n` +
      `${filesSection}\n\n` +
      `### Guardrails executados (Gate 3)\n` +
      `- Funcionalidade vs critérios de aceite\n` +
      `- Arquitetura e fronteiras\n` +
      `- Qualidade de código e testes\n` +
      `- Segurança e observabilidade\n` +
      `- NFR e DoD\n\n` +
      `### Bloqueios automáticos\n` +
      `${blockerSection}\n\n` +
      `**Veredito orquestrado:** ${verdict}\n\n` +
      `> Próximo passo obrigatório: no mesmo fluxo do chat, emita o checklist completo do Gate 3 com evidências por item e decisão final (APROVADO ou ALTERAÇÕES SOLICITADAS).\n`,
  );
}
