import * as vscode from 'vscode';
import { parseFix } from '../../fix/FixParser';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { extractSpecType } from '../../parser/BaseParser';
import { parseStory } from '../../story/StoryParser';
import { AuditLogger } from '../../workflow/AuditLogger';
import { emitCommandTelemetry } from '../../workflow/CommandTelemetry';
import { createCorrelationId } from '../../workflow/ObservabilityContext';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import {
  consumeTransitionIntent,
  createTransitionIntent,
} from '../../workflow/TransitionGovernance';
import {
  AGENT_MODES,
  AgentModeName,
  getActiveAgentMode,
  getAgentModeLabel,
  getAgentModePrompt,
  isValidAgentMode,
  setActiveAgentMode,
} from '../AgentMode';

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

export async function handleAgentCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  workspace: IWorkspace = vscodeWorkspace,
  fs: IFileSystem = vscodeFileSystem,
): Promise<void> {
  const requested = request.prompt.trim().toLowerCase();
  const tokens = requested.split(/\s+/).filter(Boolean);
  const confirmIntentId = readFlagValue(tokens, '--confirm');
  const modeToken = tokens.find((token, idx) => {
    if (token.startsWith('--')) return false;
    const previous = tokens[idx - 1];
    if (previous === '--confirm') return false;
    return true;
  });

  if (!requested) {
    const current = getActiveAgentMode();
    stream.markdown(
      `**Modo ativo:** ${getAgentModeLabel(current)}\n\n` +
        '**Modos disponíveis:**\n' +
        AGENT_MODES.map((m) => `- \`${m}\` — ${getAgentModeLabel(m)}`).join('\n') +
        '\n\n**Uso:** `@speckit /agent debugger`\n',
    );
    return;
  }

  if (tokens.includes('--confirm') && !confirmIntentId) {
    stream.markdown('❌ Use `--confirm <intent-id>` para confirmar uma troca de modo pendente.\n');
    return;
  }

  if (!modeToken && !confirmIntentId) {
    stream.markdown(
      '❌ Informe um modo alvo ou confirme um intent pendente com `--confirm <intent-id>`.\n',
    );
    return;
  }

  const workspaceRoot = workspace.getWorkspaceRoot();
  const commandExecutionId = createCorrelationId('exec');
  const active = await resolveActiveSpecContext(workspace, fs);

  if (confirmIntentId) {
    if (!workspaceRoot) {
      stream.markdown('❌ Nenhum workspace aberto para confirmar troca de modo.');
      return;
    }

    const audit = new AuditLogger(workspaceRoot, fs);
    const tracer = new TraceabilityManager(workspaceRoot, fs);
    const intent = await consumeTransitionIntent(workspaceRoot, fs, confirmIntentId, 'mode-switch');

    if (!intent) {
      await emitCommandTelemetry({
        workspaceRoot,
        fs,
        audit,
        tracer,
        command: '/agent --confirm',
        outcome: '❌ confirmação de modo rejeitada (intent inválido/expirado)',
        detail: `Intent-ID: ${confirmIntentId}`,
        commandExecutionId,
        specId: active.specId,
        specTitle: active.specTitle,
        specType: active.specType,
        gate: active.gate,
        llmResponseReceived: true,
      });

      stream.markdown(
        `❌ Intent-ID inválido ou expirado: \`${confirmIntentId}\`. Gere nova proposta com \`@speckit /agent <modo>\`.\n`,
      );
      return;
    }

    const targetMode = (intent.payload.toMode ?? '').toLowerCase();
    if (!isValidAgentMode(targetMode)) {
      stream.markdown(
        '❌ Intent pendente possui modo inválido. Gere nova proposta de troca de modo.\n',
      );
      return;
    }

    if (modeToken && modeToken !== targetMode) {
      stream.markdown(
        `❌ O modo informado (\`${modeToken}\`) não corresponde ao intent confirmado (\`${targetMode}\`).\n`,
      );
      return;
    }

    const mode = targetMode as AgentModeName;
    setActiveAgentMode(mode);
    const stack = await workspace.detectTechStack();
    const prompt = getAgentModePrompt(mode, stack);

    await emitCommandTelemetry({
      workspaceRoot,
      fs,
      audit,
      tracer,
      command: '/agent --confirm',
      outcome: `✅ modo alterado para ${mode} com confirmação explícita`,
      detail: `Intent-ID: ${intent.id}; de=${intent.payload.fromMode}; para=${mode}`,
      commandExecutionId,
      specId: active.specId,
      specTitle: active.specTitle,
      specType: active.specType,
      gate: active.gate,
      agentMode: mode,
      llmResponseReceived: true,
    });

    stream.markdown(
      `## ✅ Troca de modo confirmada\n\n` +
        `- Antes: \`${intent.payload.fromMode ?? 'default'}\`\n` +
        `- Depois: \`${mode}\`\n` +
        `- Intent-ID: \`${intent.id}\`\n\n` +
        `---\n\n${prompt}\n`,
    );
    return;
  }

  if (!modeToken || !isValidAgentMode(modeToken)) {
    stream.markdown(
      `❌ Modo inválido: \`${modeToken ?? requested}\`\n\n` +
        '**Modos disponíveis:**\n' +
        AGENT_MODES.map((m) => `- \`${m}\` — ${getAgentModeLabel(m)}`).join('\n') +
        '\n',
    );
    return;
  }

  const mode: AgentModeName = modeToken;
  const currentMode = getActiveAgentMode();
  if (mode === currentMode) {
    stream.markdown(`ℹ️ O modo \`${mode}\` já está ativo. Nenhuma transição foi aplicada.\n`);
    return;
  }

  if (workspaceRoot) {
    const audit = new AuditLogger(workspaceRoot, fs);
    const tracer = new TraceabilityManager(workspaceRoot, fs);

    const intent = await createTransitionIntent(workspaceRoot, fs, {
      kind: 'mode-switch',
      command: '/agent',
      payload: {
        fromMode: currentMode,
        toMode: mode,
        specId: active.specId ?? '',
      },
      ttlMinutes: 30,
    });

    await emitCommandTelemetry({
      workspaceRoot,
      fs,
      audit,
      tracer,
      command: '/agent',
      outcome: `⏳ troca de modo proposta (${currentMode} → ${mode}) aguardando confirmação`,
      detail: `Intent-ID: ${intent.id}`,
      commandExecutionId,
      specId: active.specId,
      specTitle: active.specTitle,
      specType: active.specType,
      gate: active.gate,
      agentMode: currentMode,
      llmResponseReceived: true,
    });

    stream.markdown(
      `## ⚠️ Confirmação obrigatória de troca de modo\n\n` +
        `- Antes: \`${currentMode}\`\n` +
        `- Depois: \`${mode}\`\n` +
        `- Intent-ID: \`${intent.id}\`\n\n` +
        'Para confirmar explicitamente:\n' +
        `- \`@speckit /agent --confirm ${intent.id}\`\n\n` +
        'Sem confirmação, a troca de modo não será aplicada.\n',
    );
    return;
  }

  stream.markdown('❌ Nenhum workspace aberto para propor troca de modo.');
}

async function resolveActiveSpecContext(
  workspace: IWorkspace,
  fs: IFileSystem,
): Promise<{ specId?: string; specTitle?: string; gate?: number; specType?: 'story' | 'fix' }> {
  const activeSpecPath = await workspace.getActiveSpecPath();
  if (!activeSpecPath) return {};

  try {
    const content = await fs.readFile(activeSpecPath);
    const specType = extractSpecType(content);

    if (specType === 'fix') {
      const fix = parseFix(content);
      return {
        specId: fix.metadata.id,
        specTitle: fix.metadata.title || fix.bugDescription.title || undefined,
        gate: fix.metadata.gate,
        specType: 'fix',
      };
    }

    const story = parseStory(content);
    return {
      specId: story.metadata.id,
      specTitle: story.metadata.title || undefined,
      gate: story.metadata.gate,
      specType: 'story',
    };
  } catch {
    return {};
  }
}
