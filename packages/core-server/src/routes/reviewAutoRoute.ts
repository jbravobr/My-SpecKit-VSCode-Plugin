import { Router, Request, Response } from 'express';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';
import { extractSpecType } from '../../../../src/parser/BaseParser';
import { Gate, SpecStatus } from '../../../../src/story/Story';
import { parseStory } from '../../../../src/story/StoryParser';
import { validateStory } from '../../../../src/story/StoryValidator';
import {
  validateGateTransition,
  validateStatusTransition,
} from '../../../../src/workflow/GateEnforcer';
import { upsertMetadataFields } from '../../../../src/workflow/MetadataPatcher';
import {
  createTransitionIntent,
  consumeTransitionIntent,
  getBatchSessionConsent,
  setBatchSessionConsent,
} from '../../../../src/workflow/TransitionGovernance';

const router = Router();

export type ReviewAutoAction = 'orchestrate' | 'approved' | 'changes-requested' | 'mutation';

interface ReviewAutoControlInput {
  action?: string;
  approved?: boolean;
  changesRequested?: boolean;
  mutation?: boolean;
  auto?: boolean;
  batchConsent?: boolean;
  confirmIntentId?: string;
  prompt?: string;
}

export interface ReviewAutoControl {
  action: ReviewAutoAction;
  auto: boolean;
  batchConsent: boolean;
  confirmIntentId?: string;
  error?: string;
}

export interface TransitionProposal {
  toGate: Gate;
  toStatus: SpecStatus;
  reason: string;
  commandLabel: string;
}

export interface StoryTransitionSummary {
  fromGate: Gate;
  toGate: Gate;
  fromStatus: SpecStatus;
  toStatus: SpecStatus;
  changed: boolean;
  reason: string;
}

const ACTION_VALUES = new Set<ReviewAutoAction>([
  'orchestrate',
  'approved',
  'changes-requested',
  'mutation',
]);

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

function parsePromptFlags(prompt: string | undefined): {
  approved: boolean;
  changesRequested: boolean;
  mutation: boolean;
  auto: boolean;
  batchConsent: boolean;
  confirmIntentId?: string;
} {
  const tokens = (prompt ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const approved = tokens.includes('--approved') || tokens.includes('--approve');
  const changesRequested =
    tokens.includes('--changes-requested') ||
    tokens.includes('--changes') ||
    tokens.includes('--rework');
  const mutation = tokens.includes('--mutation') || tokens.includes('--mut');
  const auto = tokens.includes('--auto');
  const batchConsent = tokens.includes('--batch-consent');
  const confirmIntentId = readFlagValue(tokens, '--confirm');
  return { approved, changesRequested, mutation, auto, batchConsent, confirmIntentId };
}

export function parseReviewAutoControl(input: ReviewAutoControlInput): ReviewAutoControl {
  const promptFlags = parsePromptFlags(input.prompt);
  const confirmedIntentRaw =
    typeof input.confirmIntentId === 'string'
      ? input.confirmIntentId.trim()
      : promptFlags.confirmIntentId;
  const confirmFlagPresent =
    typeof input.confirmIntentId === 'string' ||
    (input.prompt ?? '').toLowerCase().split(/\s+/).includes('--confirm');

  if (confirmFlagPresent && !confirmedIntentRaw) {
    return {
      action: 'orchestrate',
      auto: !!(input.auto ?? promptFlags.auto),
      batchConsent: !!(input.batchConsent ?? promptFlags.batchConsent),
      error: 'Use `--confirm <intent-id>` para confirmar uma transição pendente.',
    };
  }

  const normalizedAction =
    typeof input.action === 'string' ? input.action.trim().toLowerCase() : undefined;
  if (normalizedAction && !ACTION_VALUES.has(normalizedAction as ReviewAutoAction)) {
    return {
      action: 'orchestrate',
      auto: !!(input.auto ?? promptFlags.auto),
      batchConsent: !!(input.batchConsent ?? promptFlags.batchConsent),
      confirmIntentId: confirmedIntentRaw || undefined,
      error:
        `Ação inválida em /review-auto: \`${normalizedAction}\`. ` +
        'Use `orchestrate`, `approved`, `changes-requested` ou `mutation`.',
    };
  }

  const approved = !!(
    input.approved ?? (promptFlags.approved || normalizedAction === 'approved')
  );
  const changesRequested = !!(
    input.changesRequested ??
    (promptFlags.changesRequested || normalizedAction === 'changes-requested')
  );
  const mutation = !!(
    input.mutation ?? (promptFlags.mutation || normalizedAction === 'mutation')
  );
  const auto = !!(input.auto ?? promptFlags.auto);
  const batchConsent = !!(input.batchConsent ?? promptFlags.batchConsent);

  const explicitActionCount = [approved, changesRequested, mutation].filter(Boolean).length;
  if (explicitActionCount > 1) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      confirmIntentId: confirmedIntentRaw || undefined,
      error:
        'Flags conflitantes: use apenas uma entre `--approved`, `--changes-requested` e `--mutation`.',
    };
  }

  if (batchConsent && explicitActionCount > 0) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      confirmIntentId: confirmedIntentRaw || undefined,
      error: 'Use `--batch-consent` isoladamente para consentimento de sessão batch.',
    };
  }

  if (auto && batchConsent) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      confirmIntentId: confirmedIntentRaw || undefined,
      error: 'Flags incompatíveis: `--auto` não pode ser combinado com `--batch-consent`.',
    };
  }

  if (mutation && auto) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent,
      confirmIntentId: confirmedIntentRaw || undefined,
      error: 'Flags incompatíveis: `--mutation` não pode ser combinado com `--auto`.',
    };
  }

  if (batchConsent) {
    return {
      action: 'orchestrate',
      auto,
      batchConsent: true,
      confirmIntentId: confirmedIntentRaw || undefined,
    };
  }

  if (approved) {
    return { action: 'approved', auto, batchConsent: false, confirmIntentId: confirmedIntentRaw };
  }
  if (changesRequested) {
    return {
      action: 'changes-requested',
      auto,
      batchConsent: false,
      confirmIntentId: confirmedIntentRaw,
    };
  }
  if (mutation) {
    return { action: 'mutation', auto, batchConsent: false, confirmIntentId: confirmedIntentRaw };
  }

  const action = (normalizedAction as ReviewAutoAction | undefined) ?? 'orchestrate';
  return { action, auto, batchConsent: false, confirmIntentId: confirmedIntentRaw || undefined };
}

export function buildTransitionProposal(action: ReviewAutoAction): TransitionProposal | undefined {
  if (action === 'approved') {
    return {
      toGate: 4,
      toStatus: 'ready-to-commit',
      reason: 'Veredito APROVADO confirmado no Gate 3. Gate 4 aguardando commit final.',
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

  if (action === 'orchestrate') {
    return {
      toGate: 3,
      toStatus: 'review',
      reason: 'Handoff implementador → revisor orquestrado automaticamente.',
      commandLabel: '/review-auto',
    };
  }

  return undefined;
}

export function applyStoryTransition(
  content: string,
  fromGate: Gate,
  fromStatus: SpecStatus,
  toGate: Gate,
  toStatus: SpecStatus,
  reason: string,
): { content: string; summary: StoryTransitionSummary; changed: boolean } {
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

  const patch = upsertMetadataFields(content, { gate: toGate, status: toStatus });
  return {
    content: patch.content,
    changed: patch.changed,
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
      '- ℹ️ Sem mudança persistida (gate/status já estavam no estado esperado).\n' +
      `- Motivo: ${summary.reason}\n`
    );
  }

  return (
    `### 🚪 Transição de Gate/Status\n` +
    '| Campo | Antes | Depois |\n' +
    '| --- | --- | --- |\n' +
    `| Gate | \`${summary.fromGate}\` | \`${summary.toGate}\` |\n` +
    `| Status | \`${summary.fromStatus}\` | \`${summary.toStatus}\` |\n\n` +
    `**Motivo:** ${summary.reason}\n`
  );
}

function buildTransitionProposalMarkdown(
  storyId: string,
  fromGate: Gate,
  toGate: Gate,
  fromStatus: SpecStatus,
  toStatus: SpecStatus,
  intentId: string,
  commandLabel: string,
): string {
  return (
    `## ⚠️ Confirmação obrigatória de transição — STORY-${storyId}\n\n` +
    '### 🚪 Transição de Gate/Status (proposta)\n' +
    '| Campo | Antes | Depois |\n' +
    '| --- | --- | --- |\n' +
    `| Gate | \`${fromGate}\` | \`${toGate}\` |\n` +
    `| Status | \`${fromStatus}\` | \`${toStatus}\` |\n\n` +
    `Intent-ID: \`${intentId}\`\n\n` +
    'Para confirmar explicitamente:\n' +
    `- \`${commandLabel} --confirm ${intentId}\`\n\n` +
    'Sem confirmação, nenhuma alteração será persistida.\n'
  );
}

function buildBatchConsentProposalMarkdown(intentId: string): string {
  return (
    '## ⚠️ Consentimento único obrigatório — sessão batch unificada\n\n' +
    'Este consentimento autoriza handoffs automáticos somente nesta sessão.\n\n' +
    `Intent-ID: \`${intentId}\`\n\n` +
    'Para confirmar explicitamente:\n' +
    `- \`/review-auto --batch-consent --confirm ${intentId}\`\n`
  );
}

router.post('/review-auto', async (req: Request, res: Response) => {
  const {
    workspaceRoot,
    specFile,
    action,
    approved,
    changesRequested,
    mutation,
    auto,
    batchConsent,
    confirmIntentId,
    prompt,
  } = req.body as {
    workspaceRoot: string;
    specFile?: string;
    action?: string;
    approved?: boolean;
    changesRequested?: boolean;
    mutation?: boolean;
    auto?: boolean;
    batchConsent?: boolean;
    confirmIntentId?: string;
    prompt?: string;
  };

  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  const control = parseReviewAutoControl({
    action,
    approved,
    changesRequested,
    mutation,
    auto,
    batchConsent,
    confirmIntentId,
    prompt,
  });
  if (control.error) {
    res.status(400).json({ error: 'invalid review-auto control', markdown: `❌ ${control.error}` });
    return;
  }

  try {
    const workspace = createNodeWorkspace(workspaceRoot);
    const activeSpecPath = specFile ?? (await workspace.getActiveSpecPath());

    if (!activeSpecPath) {
      res.status(404).json({
        error: 'Nenhuma spec ativa encontrada',
        markdown: '❌ Nenhuma spec ativa encontrada. Use `/new` para criar uma.',
      });
      return;
    }

    const content = await nodeFileSystem.readFile(activeSpecPath);
    const specType = extractSpecType(content);
    if (specType !== 'story') {
      res.status(400).json({
        error: 'review-auto supports story only',
        markdown: '❌ `/review-auto` está disponível apenas para Story no momento.',
      });
      return;
    }

    const story = parseStory(content);
    const validation = validateStory(story);

    if (control.batchConsent) {
      if (!control.confirmIntentId) {
        const consentIntent = await createTransitionIntent(workspaceRoot, nodeFileSystem, {
          kind: 'batch-consent',
          command: '/review-auto --batch-consent',
          payload: {
            specId: story.metadata.id,
            specTitle: story.metadata.title,
          },
          ttlMinutes: 30,
        });

        res.json({
          specPath: activeSpecPath,
          requiresConfirmation: true,
          intentId: consentIntent.id,
          markdown: buildBatchConsentProposalMarkdown(consentIntent.id),
        });
        return;
      }

      const consumed = await consumeTransitionIntent(
        workspaceRoot,
        nodeFileSystem,
        control.confirmIntentId,
        'batch-consent',
      );
      if (!consumed) {
        res.status(400).json({
          error: 'invalid or expired batch-consent intent',
          markdown:
            `❌ Intent-ID inválido ou expirado: \`${control.confirmIntentId}\`. ` +
            'Gere um novo consentimento com `/review-auto --batch-consent`.',
        });
        return;
      }

      const consent = await setBatchSessionConsent(workspaceRoot, nodeFileSystem, {
        ttlMinutes: 240,
        note: `Batch consent confirmed from intent ${consumed.id}`,
      });
      res.json({
        specPath: activeSpecPath,
        consentEnabled: true,
        consentId: consent.id,
        markdown:
          '✅ Consentimento único da sessão batch registrado com sucesso.\n\n' +
          'Agora comandos com `--auto` podem executar handoffs automáticos durante esta sessão.',
      });
      return;
    }

    if (control.action === 'mutation') {
      res.json({
        specPath: activeSpecPath,
        valid: validation.valid,
        gaps: validation.gaps,
        markdown:
          `## 🧪 Avaliação de Mutation — STORY-${story.metadata.id}\n\n` +
          'A trilha detalhada de mutation testing (CRAP + cobertura por função) ainda está disponível no participant do VS Code.\n' +
          'No IntelliJ/Core Server este comando atua como guia:\n' +
          '- Execute a revisão normal com `/review-auto`\n' +
          '- Se houver necessidade de mutation, execute sua ferramenta da stack e retorne ao ciclo.\n',
      });
      return;
    }

    if (story.metadata.status === 'done' || story.metadata.status === 'cancelled') {
      res.status(409).json({
        error: 'story is in terminal status',
        markdown:
          `❌ Story \`${story.metadata.id}\` já está em status terminal (\`${story.metadata.status}\`).`,
      });
      return;
    }

    if (control.action === 'approved' && story.metadata.gate !== 3) {
      res.status(409).json({
        error: 'invalid gate for approved',
        markdown:
          `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. ` +
          'O encerramento automático exige Gate 3 com revisão concluída.',
      });
      return;
    }

    if (control.action === 'changes-requested') {
      const allowFromGate3 = story.metadata.gate === 3;
      const allowFromGate4Pending =
        story.metadata.gate === 4 && story.metadata.status === 'ready-to-commit';
      if (!allowFromGate3 && !allowFromGate4Pending) {
        res.status(409).json({
          error: 'invalid gate/status for changes-requested',
          markdown:
            `❌ Story \`${story.metadata.id}\` está em Gate/Status incompatível. ` +
            'O retorno para retrabalho exige Gate 3 (review) ou Gate 4 (ready-to-commit).',
        });
        return;
      }
    }

    if (control.action === 'orchestrate') {
      if (story.metadata.gate < 2) {
        res.status(409).json({
          error: 'gate below review threshold',
          markdown:
            `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. ` +
            'A revisão automática exige conclusão prévia dos Gates 0-2.',
        });
        return;
      }
      if (story.metadata.gate > 3) {
        res.status(409).json({
          error: 'gate above review window',
          markdown:
            `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. ` +
            'Para novos ciclos de revisão, retorne antes ao Gate 2.',
        });
        return;
      }
      if (!validation.valid) {
        res.status(409).json({
          error: 'story validation gaps',
          valid: false,
          gaps: validation.gaps,
          markdown:
            `## ❌ Review Auto — Bloqueado\n\n` +
            `A spec possui ${validation.gaps.length} lacuna(s) — complete antes de avançar para revisão:\n\n` +
            validation.gaps.map((gap) => `- ${gap}`).join('\n'),
        });
        return;
      }
    }

    const proposal = buildTransitionProposal(control.action);
    if (!proposal) {
      res.status(400).json({
        error: 'unsupported action',
        markdown: `❌ Ação não suportada para transição: ${control.action}`,
      });
      return;
    }

    if (control.auto) {
      const consent = await getBatchSessionConsent(workspaceRoot, nodeFileSystem);
      if (!consent) {
        res.status(409).json({
          error: 'missing batch consent for auto transition',
          markdown:
            '❌ Transição automática bloqueada: execute `/review-auto --batch-consent` e confirme antes de usar `--auto`.',
        });
        return;
      }
    }

    let targetGate = proposal.toGate;
    let targetStatus = proposal.toStatus;
    let transitionReason = proposal.reason;

    if (!control.auto && !control.confirmIntentId) {
      const intent = await createTransitionIntent(workspaceRoot, nodeFileSystem, {
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

      res.json({
        specPath: activeSpecPath,
        valid: validation.valid,
        gaps: validation.gaps,
        requiresConfirmation: true,
        intentId: intent.id,
        markdown: buildTransitionProposalMarkdown(
          story.metadata.id,
          story.metadata.gate,
          proposal.toGate,
          story.metadata.status,
          proposal.toStatus,
          intent.id,
          proposal.commandLabel,
        ),
      });
      return;
    }

    if (!control.auto && control.confirmIntentId) {
      const intent = await consumeTransitionIntent(
        workspaceRoot,
        nodeFileSystem,
        control.confirmIntentId,
        'gate-transition',
      );
      if (!intent) {
        res.status(400).json({
          error: 'invalid or expired gate-transition intent',
          markdown:
            `❌ Intent-ID inválido ou expirado: \`${control.confirmIntentId}\`. ` +
            `Gere nova proposta com \`${proposal.commandLabel}\`.`,
        });
        return;
      }

      const intentSpecId = intent.payload.specId;
      const intentFromGate = Number.parseInt(intent.payload.fromGate ?? '', 10);
      const intentFromStatus = intent.payload.fromStatus as SpecStatus;
      if (
        intentSpecId !== story.metadata.id ||
        intentFromGate !== story.metadata.gate ||
        intentFromStatus !== story.metadata.status
      ) {
        res.status(409).json({
          error: 'story state diverged from proposed intent',
          markdown:
            '❌ A story mudou após a proposta de transição. Gere uma nova proposta e confirme novamente.',
        });
        return;
      }

      targetGate = Number.parseInt(intent.payload.toGate ?? '', 10) as Gate;
      targetStatus = intent.payload.toStatus as SpecStatus;
      transitionReason = intent.payload.reason ?? proposal.reason;
    }

    const transition = applyStoryTransition(
      content,
      story.metadata.gate,
      story.metadata.status,
      targetGate,
      targetStatus,
      transitionReason,
    );

    if (transition.changed) {
      await nodeFileSystem.writeFile(activeSpecPath, transition.content);
    }

    let markdown = '';
    if (control.action === 'approved') {
      markdown =
        `## ✅ Gate 4 Orquestrado — STORY-${story.metadata.id}\n\n` +
        `${formatTransitionMarkdown(transition.summary)}\n\n` +
        'Próximo passo: execute `/commit` para concluir a story em `done`.';
    } else if (control.action === 'changes-requested') {
      markdown =
        `## 🔄 Retorno Orquestrado para Retrabalho — STORY-${story.metadata.id}\n\n` +
        `${formatTransitionMarkdown(transition.summary)}\n\n` +
        'Próximo passo: aplicar correções e executar `/review-auto` novamente.';
    } else {
      markdown =
        `## ✅ Revisão Orquestrada — STORY-${story.metadata.id}\n\n` +
        `${formatTransitionMarkdown(transition.summary)}\n\n` +
        'Próximos passos:\n' +
        '- `/review-auto --changes-requested --auto`\n' +
        '- `/review-auto --approved --auto`';
    }

    res.json({
      specPath: activeSpecPath,
      valid: validation.valid,
      gaps: validation.gaps,
      action: control.action,
      auto: control.auto,
      applied: true,
      transition: transition.summary,
      markdown,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
