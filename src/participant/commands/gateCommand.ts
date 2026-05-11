import * as vscode from 'vscode';
import type { Gate, SpecStatus } from '../../story/Story';
import {
  getValidNextGates,
  getValidNextStatuses,
  validateGateTransition,
  validateStatusTransition,
} from '../../workflow/GateEnforcer';

const GATE_LABELS: Record<Gate, string> = {
  0: 'Alinhamento',
  1: 'Implementação',
  2: 'Testes',
  3: 'Revisão',
  4: 'Entrega',
};

const ALL_STATUSES: SpecStatus[] = [
  'open',
  'in-progress',
  'review',
  'blocked',
  'done',
  'cancelled',
];

function emitChatQuickActionButton(
  stream: vscode.ChatResponseStream,
  title: string,
  query: string,
): void {
  const command: vscode.Command = {
    title,
    command: 'speckit.runChatQuickAction',
    arguments: [query],
  };

  if (typeof stream.button === 'function') {
    stream.button(command);
    return;
  }

  if (typeof stream.push === 'function') {
    stream.push(new vscode.ChatResponseCommandButtonPart(command));
  }
}

function renderRules(): string {
  const lines: string[] = [
    '## 🚪 Regras de Gate & Status\n',
    '### Transições de Gate\n',
    '| De | Para | Permitido |',
    '|---|---|---|',
  ];
  for (let from = 0; from <= 4; from++) {
    const next = getValidNextGates(from as Gate);
    const targets = next.map((g) => `Gate ${g} — ${GATE_LABELS[g]}`).join(', ') || '—';
    lines.push(`| Gate ${from} — ${GATE_LABELS[from as Gate]} | ${targets} | ✅ |`);
  }
  lines.push('', '> Avanço máximo: +1. Regressão máxima: -1 (retrabalho).\n');

  lines.push('### Transições de Status\n');
  lines.push('| De | Próximos válidos |');
  lines.push('|---|---|');
  for (const s of ALL_STATUSES) {
    const next = getValidNextStatuses(s);
    lines.push(
      `| \`${s}\` | ${next.length > 0 ? next.map((n) => `\`${n}\``).join(', ') : '🔒 terminal'} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function parseGateNum(s: string): Gate | undefined {
  const n = Number(s);
  if (Number.isInteger(n) && n >= 0 && n <= 4) return n as Gate;
  return undefined;
}

function isValidStatus(s: string): s is SpecStatus {
  return ALL_STATUSES.includes(s as SpecStatus);
}

export async function handleGateCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
): Promise<void> {
  const args = request.prompt.trim();

  if (!args || args === 'rules') {
    stream.markdown(renderRules());
    stream.markdown(
      '> ℹ️ `/gate` é um comando informacional. Para ver o estado real das specs, use `@speckit /status`.\n' +
        '> Para documentação completa, use `@speckit /help gate`.\n\n' +
        '### Comandos disponíveis agora (contextuais)\n' +
        '- `@speckit /gate check gate <de> <para>` (validar transição de gate)\n' +
        '- `@speckit /gate check status <de> <para>` (validar transição de status)\n' +
        '- `@speckit /status` (ver situação atual das specs)\n\n' +
        '> Para checks com parâmetros variáveis, continue digitando no chat com os valores desejados.\n',
    );
    emitChatQuickActionButton(stream, '📊 Ver Status das Specs', '@speckit /status');
    return;
  }

  const parts = args.split(/\s+/);
  if (parts[0] !== 'check' || parts.length < 4) {
    stream.markdown(
      '❌ Uso inválido.\n\n' +
        '**Exemplos:**\n' +
        '- `@speckit /gate` — Mostrar regras\n' +
        '- `@speckit /gate check gate 0 1` — Validar transição de gate\n' +
        '- `@speckit /gate check status open review` — Validar transição de status\n',
    );
    stream.markdown(
      '### Comandos disponíveis agora (contextuais)\n' +
        '- `@speckit /gate` (mostrar regras completas)\n' +
        '- `@speckit /gate check gate 0 1` (exemplo válido de gate)\n' +
        '- `@speckit /gate check status open in-progress` (exemplo válido de status)\n',
    );
    emitChatQuickActionButton(stream, '🚪 Mostrar Regras de Gate', '@speckit /gate');
    return;
  }

  const kind = parts[1]; // 'gate' or 'status'
  const from = parts[2];
  const to = parts[3];

  if (kind === 'gate') {
    const fromGate = parseGateNum(from);
    const toGate = parseGateNum(to);
    if (fromGate === undefined || toGate === undefined) {
      stream.markdown('❌ Gates devem ser números de 0 a 4.\n');
      stream.markdown(
        '### Comandos disponíveis agora (contextuais)\n' +
          '- `@speckit /gate check gate 0 1` (validar avanço padrão)\n' +
          '- `@speckit /gate` (consultar regras completas)\n',
      );
      emitChatQuickActionButton(stream, '▶ Validar Gate 0 → 1', '@speckit /gate check gate 0 1');
      return;
    }
    const result = validateGateTransition(fromGate, toGate);
    const icon = result.allowed ? '✅' : '❌';
    const next = getValidNextGates(fromGate);
    stream.markdown(
      `${icon} **Gate ${fromGate} → ${toGate}:** ${result.allowed ? 'PERMITIDO' : 'BLOQUEADO'}` +
        (result.reason ? `\n> ${result.reason}` : '') +
        `\n\n**Próximos gates válidos a partir de ${fromGate}:** ${next.map((g) => `${g} (${GATE_LABELS[g]})`).join(', ') || '—'}\n`,
    );
    stream.markdown(
      '### Comandos disponíveis agora (contextuais)\n' +
        `- \`@speckit /gate check gate ${fromGate} <para>\` (testar outro destino de gate)\n` +
        '- `@speckit /gate check status <de> <para>` (testar regra de status)\n' +
        '- `@speckit /status` (ver status real das specs)\n',
    );
    for (const candidateGate of next) {
      emitChatQuickActionButton(
        stream,
        `▶ Validar ${fromGate} → ${candidateGate}`,
        `@speckit /gate check gate ${fromGate} ${candidateGate}`,
      );
    }
    emitChatQuickActionButton(stream, '📊 Ver Status das Specs', '@speckit /status');
    return;
  }

  if (kind === 'status') {
    if (!isValidStatus(from) || !isValidStatus(to)) {
      stream.markdown(
        `❌ Status inválido. Valores aceitos: ${ALL_STATUSES.map((s) => `\`${s}\``).join(', ')}\n`,
      );
      stream.markdown(
        '### Comandos disponíveis agora (contextuais)\n' +
          '- `@speckit /gate check status open in-progress` (exemplo válido de status)\n' +
          '- `@speckit /gate` (consultar matriz de transições)\n',
      );
      emitChatQuickActionButton(
        stream,
        '▶ Validar Status open → in-progress',
        '@speckit /gate check status open in-progress',
      );
      return;
    }
    const result = validateStatusTransition(from, to);
    const icon = result.allowed ? '✅' : '❌';
    const next = getValidNextStatuses(from);
    stream.markdown(
      `${icon} **\`${from}\` → \`${to}\`:** ${result.allowed ? 'PERMITIDO' : 'BLOQUEADO'}` +
        (result.reason ? `\n> ${result.reason}` : '') +
        `\n\n**Próximos statuses válidos a partir de \`${from}\`:** ${next.map((s) => `\`${s}\``).join(', ') || '🔒 terminal'}\n`,
    );
    stream.markdown(
      '### Comandos disponíveis agora (contextuais)\n' +
        `- \`@speckit /gate check status ${from} <para>\` (testar outro destino de status)\n` +
        '- `@speckit /gate check gate <de> <para>` (testar regra de gate)\n' +
        '- `@speckit /status` (ver status real das specs)\n',
    );
    for (const candidateStatus of next) {
      emitChatQuickActionButton(
        stream,
        `▶ Validar ${from} → ${candidateStatus}`,
        `@speckit /gate check status ${from} ${candidateStatus}`,
      );
    }
    emitChatQuickActionButton(stream, '📊 Ver Status das Specs', '@speckit /status');
    return;
  }

  stream.markdown(
    '❌ Tipo inválido. Use `gate` ou `status`.\n' +
      '**Exemplo:** `@speckit /gate check gate 0 1`\n',
  );
  stream.markdown(
    '### Comandos disponíveis agora (contextuais)\n' +
      '- `@speckit /gate` (mostrar regras de gate/status)\n' +
      '- `@speckit /gate check gate 0 1` (exemplo válido de gate)\n' +
      '- `@speckit /gate check status open in-progress` (exemplo válido de status)\n',
  );
  emitChatQuickActionButton(stream, '🚪 Mostrar Regras de Gate', '@speckit /gate');
}
