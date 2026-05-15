import { Router, Request, Response } from 'express';
import {
  AGENT_MODES,
  AgentModeName,
  getAgentModeLabel,
  getAgentModePrompt,
  isValidAgentMode,
} from '../../../../src/participant/AgentMode';
import { createTransitionIntent, consumeTransitionIntent } from '../../../../src/workflow/TransitionGovernance';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';

const router = Router();
const workspaceModes = new Map<string, AgentModeName>();

function getWorkspaceMode(workspaceRoot?: string): AgentModeName {
  if (!workspaceRoot) return 'default';
  return workspaceModes.get(workspaceRoot) ?? 'default';
}

function setWorkspaceMode(workspaceRoot: string, mode: AgentModeName): void {
  workspaceModes.set(workspaceRoot, mode);
}

interface AgentControlInput {
  mode?: string;
  confirmIntentId?: string;
}

export type AgentControlValidationResult =
  | { ok: true; requestedMode?: AgentModeName; confirmIntentId?: string }
  | { ok: false; markdown: string };

export function resolveRequestedAgentMode(mode?: string): AgentModeName | undefined {
  const normalized = mode?.trim().toLowerCase();
  if (!normalized) return undefined;
  return isValidAgentMode(normalized) ? normalized : undefined;
}

export function validateAgentControl(input: AgentControlInput): AgentControlValidationResult {
  const confirmRaw =
    typeof input.confirmIntentId === 'string' ? input.confirmIntentId.trim() : undefined;
  const modeRaw = typeof input.mode === 'string' ? input.mode.trim() : undefined;

  if (typeof input.confirmIntentId === 'string' && !confirmRaw) {
    return {
      ok: false,
      markdown: '❌ Use `--confirm <intent-id>` para confirmar uma troca de modo pendente.',
    };
  }

  if (modeRaw && !isValidAgentMode(modeRaw.toLowerCase())) {
    return {
      ok: false,
      markdown:
        `❌ Modo inválido: \`${modeRaw.toLowerCase()}\`\n\n` +
        '**Modos disponíveis:**\n' +
        AGENT_MODES.map((m) => `- \`${m}\` — ${getAgentModeLabel(m)}`).join('\n'),
    };
  }

  return {
    ok: true,
    requestedMode: modeRaw ? (modeRaw.toLowerCase() as AgentModeName) : undefined,
    confirmIntentId: confirmRaw || undefined,
  };
}

router.get('/agent', (req: Request, res: Response) => {
  const workspaceRoot = (req.query.workspaceRoot as string | undefined)?.trim();
  const activeMode = getWorkspaceMode(workspaceRoot);
  const modes = AGENT_MODES.map((mode) => ({
    mode,
    label: getAgentModeLabel(mode),
  }));

  const markdown =
    '## 🤖 Agent Modes\n\n' +
    '| Modo | Descrição |\n|---|---|\n' +
    modes.map((m) => `| \`${m.mode}\` | ${m.label} |`).join('\n') +
    `\n\nModo ativo atual: \`${activeMode}\`` +
    '\n\nUse `/agent <modo>` para alternar o modo ativo.';

  res.json({ activeMode, modes, markdown });
});

router.post('/agent', async (req: Request, res: Response) => {
  const { workspaceRoot, mode, confirmIntentId } = req.body as {
    workspaceRoot: string;
    mode?: string;
    confirmIntentId?: string;
  };

  const control = validateAgentControl({ mode, confirmIntentId });
  if (!control.ok) {
    res.status(400).json({
      error: 'invalid agent control',
      markdown: control.markdown,
    });
    return;
  }

  if (!control.requestedMode && !control.confirmIntentId) {
    const activeMode = getWorkspaceMode(workspaceRoot);
    const modes = AGENT_MODES.map((entryMode) => ({
      mode: entryMode,
      label: getAgentModeLabel(entryMode),
    }));
    const markdown =
      '## 🤖 Agent Modes\n\n' +
      '| Modo | Descrição |\n|---|---|\n' +
      modes.map((item) => `| \`${item.mode}\` | ${item.label} |`).join('\n') +
      `\n\nModo ativo atual: \`${activeMode}\`` +
      '\n\nUse `/agent <modo>` para solicitar a troca e `/agent --confirm <intent-id>` para confirmar.';
    res.json({ activeMode, modes, markdown });
    return;
  }

  if (!workspaceRoot) {
    res.status(400).json({
      error: 'workspaceRoot is required',
      markdown: '❌ workspaceRoot é obrigatório para troca de modo.',
    });
    return;
  }

  const activeMode = getWorkspaceMode(workspaceRoot);

  if (control.confirmIntentId) {
    const intent = await consumeTransitionIntent(
      workspaceRoot,
      nodeFileSystem,
      control.confirmIntentId,
      'mode-switch',
    );
    if (!intent) {
      res.status(400).json({
        error: 'invalid or expired mode-switch intent',
        markdown:
          `❌ Intent-ID inválido ou expirado: \`${control.confirmIntentId}\`. ` +
          'Gere nova proposta com `/agent <modo>`.',
      });
      return;
    }

    const targetMode = resolveRequestedAgentMode(intent.payload.toMode);
    if (!targetMode) {
      res.status(400).json({
        error: 'invalid intent payload',
        markdown: '❌ Intent pendente possui modo inválido. Gere nova proposta de troca de modo.',
      });
      return;
    }

    if (control.requestedMode && control.requestedMode !== targetMode) {
      res.status(400).json({
        error: 'mode mismatch',
        markdown:
          `❌ O modo informado (\`${control.requestedMode}\`) não corresponde ao intent ` +
          `confirmado (\`${targetMode}\`).`,
      });
      return;
    }

    const fromMode = activeMode;
    setWorkspaceMode(workspaceRoot, targetMode);
    let stackLabel = '';
    try {
      const workspace = createNodeWorkspace(workspaceRoot);
      const stack = await workspace.detectTechStack();
      stackLabel = `${stack.language}${stack.framework ? ` / ${stack.framework}` : ''}`;
    } catch {
      stackLabel = '';
    }

    const prompt = getAgentModePrompt(targetMode);
    const markdown =
      `## ✅ Troca de modo confirmada\n\n` +
      `- Antes: \`${fromMode}\`\n` +
      `- Depois: \`${targetMode}\`\n` +
      `- Intent-ID: \`${intent.id}\`\n` +
      (stackLabel ? `- Stack detectada: ${stackLabel}\n\n` : '\n') +
      `---\n\n${prompt}\n`;

    res.json({
      fromMode,
      activeMode: targetMode,
      confirmed: true,
      intentId: intent.id,
      markdown,
    });
    return;
  }

  if (!control.requestedMode) {
    res.status(400).json({
      error: 'mode is required',
      markdown: '❌ Informe um modo alvo ou use `/agent --confirm <intent-id>` para confirmar.',
    });
    return;
  }

  if (control.requestedMode === activeMode) {
    res.json({
      fromMode: activeMode,
      activeMode,
      markdown: `ℹ️ O modo \`${activeMode}\` já está ativo. Nenhuma transição foi aplicada.`,
    });
    return;
  }

  const intent = await createTransitionIntent(workspaceRoot, nodeFileSystem, {
    kind: 'mode-switch',
    command: '/agent',
    payload: {
      fromMode: activeMode,
      toMode: control.requestedMode,
    },
    ttlMinutes: 30,
  });

  const markdown =
    `## ⚠️ Confirmação obrigatória de troca de modo\n\n` +
    `- Antes: \`${activeMode}\`\n` +
    `- Depois: \`${control.requestedMode}\`\n` +
    `- Intent-ID: \`${intent.id}\`\n\n` +
    'Para confirmar explicitamente:\n' +
    `- \`/agent --confirm ${intent.id}\`\n\n` +
    'Sem confirmação, a troca de modo não será aplicada.';

  res.json({
    fromMode: activeMode,
    activeMode,
    targetMode: control.requestedMode,
    requiresConfirmation: true,
    intentId: intent.id,
    markdown,
  });
});

export default router;
