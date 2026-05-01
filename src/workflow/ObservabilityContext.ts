export type AgentExecutionMode = 'default' | 'implementador' | 'revisor' | 'debugger' | 'refactor';

const MAX_ALIAS_LABEL_LENGTH = 96;

export interface CommandCorrelationContext {
  commandExecutionId?: string;
  batchId?: string;
  sessionId?: string;
  specId?: string;
  specTitle?: string;
  agentMode?: AgentExecutionMode;
  gate?: number;
  sessionAlias?: string;
  llmResponseReceived?: boolean;
}

export function createCorrelationId(prefix: 'exec' | 'batch' | 'session' = 'exec'): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${stamp}-${rand}`;
}

export function inferAgentModeFromGate(gate: number | undefined): AgentExecutionMode {
  if (gate === undefined || Number.isNaN(gate)) return 'default';
  if (gate <= 2) return 'implementador';
  return 'revisor';
}

export function buildSessionAlias(
  specId: string | undefined,
  specTitle: string | undefined,
  agentMode: AgentExecutionMode,
  gate: number | undefined,
): string {
  const label = sanitizeAliasPart(specTitle || specId || 'global-session');
  const gateLabel = gate === undefined ? '-' : String(gate);
  return `${label} + ${agentMode} + Gate-${gateLabel}`;
}

function sanitizeAliasPart(value: string): string {
  const sanitized = value
    .replace(/[\r\n|`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (sanitized.length <= MAX_ALIAS_LABEL_LENGTH) {
    return sanitized;
  }

  const maxWithoutEllipsis = MAX_ALIAS_LABEL_LENGTH - 3;
  const head = sanitized.slice(0, maxWithoutEllipsis).trimEnd();
  const boundary = head.lastIndexOf(' ');

  // Keep truncation stable while preferring whole-word cuts for readability.
  if (boundary >= Math.floor(maxWithoutEllipsis * 0.6)) {
    return `${head.slice(0, boundary)}...`;
  }

  return `${head}...`;
}
