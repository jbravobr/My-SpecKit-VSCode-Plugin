import type { EvidenceReport } from './GateEvidenceCollector';
import type { Finding, Severity } from '../validator/auto/types';

export interface RevisorPrompt {
  summary: string;
  body: string;
  hasBlockingFindings: boolean;
  delegatedCommands: string[];
}

const SEVERITY_EMOJI: Record<Severity, string> = {
  blocker: '🛑',
  error: '❌',
  warn: '⚠️',
  info: 'ℹ️',
};

const SEVERITY_ORDER: Record<Severity, number> = {
  blocker: 0,
  error: 1,
  warn: 2,
  info: 3,
};

export function formatFindingLine(f: Finding): string {
  const emoji = SEVERITY_EMOJI[f.severity] ?? '•';
  const loc = f.path ? `${f.path}${typeof f.line === 'number' ? `:${f.line}` : ''}` : '(sem-path)';
  const base = `${loc}: ${emoji} ${f.severity}: ${f.message}`;
  return f.suggestedFix ? `${base} Fix: ${f.suggestedFix}` : `${base}`;
}

export function buildRevisorPrompt(report: EvidenceReport): RevisorPrompt {
  const sorted = [...report.findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.path ?? '').localeCompare(b.path ?? '') ||
      (a.line ?? 0) - (b.line ?? 0),
  );

  const blocking = sorted.filter((f) => f.severity === 'error' || f.severity === 'blocker');
  const warns = sorted.filter((f) => f.severity === 'warn');
  const infos = sorted.filter((f) => f.severity === 'info');
  const delegated = sorted.filter((f) => f.delegatedToRevisor);

  const lines: string[] = [];
  lines.push(
    `Gate alvo: ${report.gate}. Status: ${report.passed ? 'PASSED' : 'BLOCKED'}. ` +
      `Validadores: ${report.validatorsRun.join(', ') || '(nenhum)'} ` +
      `(${report.findings.length} findings em ${report.durationMs}ms, runId=${report.runId}).`,
  );

  if (blocking.length > 0) {
    lines.push('');
    lines.push(`## Bloqueadores (${blocking.length}) — devem ser corrigidos antes de avançar:`);
    for (const f of blocking) lines.push(formatFindingLine(f));
  }
  if (warns.length > 0) {
    lines.push('');
    lines.push(`## Avisos (${warns.length}) — analisar e tratar se aplicável:`);
    for (const f of warns) lines.push(formatFindingLine(f));
  }
  if (delegated.length > 0) {
    lines.push('');
    lines.push(`## Validações delegadas ao Revisor (${delegated.length}):`);
    for (const f of delegated) {
      const d = f.delegatedToRevisor!;
      lines.push(`- [${d.stack ?? 'generic'}] \`${d.command}\` — ${d.reason}`);
    }
  }
  if (infos.length > 0 && delegated.length === 0) {
    lines.push('');
    lines.push(`## Info (${infos.length}):`);
    for (const f of infos) lines.push(formatFindingLine(f));
  }

  if (sorted.length === 0) {
    lines.push('');
    lines.push('Nenhum achado. Plugin libera avanço do gate.');
  }

  return {
    summary: report.passed
      ? `Gate ${report.gate} aprovado pelo plugin (${report.findings.length} findings, nenhum bloqueador).`
      : `Gate ${report.gate} BLOQUEADO pelo plugin: ${blocking.length} bloqueador(es). Revisor deve coordenar fixes com Implementador antes de reavaliar.`,
    body: lines.join('\n'),
    hasBlockingFindings: blocking.length > 0,
    delegatedCommands: delegated.map((f) => f.delegatedToRevisor!.command),
  };
}
