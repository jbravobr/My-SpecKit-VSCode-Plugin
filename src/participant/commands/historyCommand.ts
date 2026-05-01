import * as path from 'path';
import * as vscode from 'vscode';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { AuditLogger } from '../../workflow/AuditLogger';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import { requireWorkspace } from './CommandHelpers';

type HistorySource = 'audit' | 'trace' | 'log';
type HistoryFilter = HistorySource | 'all';
type HistoryView = 'events' | 'sessions' | 'session';

interface HistoryEvent {
  timestamp: string;
  order: number;
  source: HistorySource;
  summary: string;
  command?: string;
  specId?: string;
  agentMode?: string;
  gate?: number;
  sessionAlias?: string;
}

interface SessionGroup {
  alias: string;
  count: number;
  latestTimestamp: string;
  specs: Set<string>;
}

interface HistoryArgs {
  filter: HistoryFilter;
  limit: number;
  view: HistoryView;
  sessionQuery?: string;
}

type SessionAliasSelection =
  | { kind: 'ok'; alias: string }
  | { kind: 'missing-query' }
  | { kind: 'not-found'; query: string }
  | { kind: 'ambiguous'; query: string; matches: string[] };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;
const DEFAULT_SESSION_SUMMARY_LIMIT = 8;
const NO_ALIAS_CANONICAL = 'sem-alias-canonico';

export async function handleHistoryCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const { filter, limit, view, sessionQuery } = parseHistoryArgs(request.prompt.trim());

  const [auditEvents, traceEvents, logEvents] = await Promise.all([
    loadAuditEvents(workspaceRoot, fs),
    loadTraceEvents(workspaceRoot, fs),
    loadSessionLogEvents(workspaceRoot, fs),
  ]);

  const all = [...auditEvents, ...traceEvents, ...logEvents].sort(
    (a, b) => toSortValue(b.timestamp) - toSortValue(a.timestamp) || b.order - a.order,
  );

  const filtered = filter === 'all' ? all : all.filter((event) => event.source === filter);
  if (filtered.length === 0) {
    stream.markdown('🕘 Nenhum evento de history encontrado para o filtro informado.\n');
    return;
  }

  if (view === 'sessions') {
    const summary = emitSessionSummary(stream, filtered, limit);
    if (summary.length === 0) {
      stream.markdown('🕘 Nenhuma sessão canônica encontrada para o filtro informado.\n');
      return;
    }

    stream.markdown(
      'Use `@speckit /history session "<alias>"` para expandir uma sessão específica.\n' +
        'Exemplo: `@speckit /history session implementador trace 30`.\n',
    );
    return;
  }

  if (view === 'session') {
    const selection = resolveSessionAlias(filtered, sessionQuery);

    if (selection.kind === 'missing-query') {
      stream.markdown(
        '⚠️ Informe um alias (ou trecho) após `session`.\n' +
          'Exemplo: `@speckit /history session implementador`\n\n',
      );
      emitSessionSummary(stream, filtered, DEFAULT_SESSION_SUMMARY_LIMIT);
      return;
    }

    if (selection.kind === 'not-found') {
      stream.markdown(
        `⚠️ Nenhuma sessão canônica encontrada para \`${escapeCell(selection.query)}\`.\n\n`,
      );
      emitSessionSummary(stream, filtered, DEFAULT_SESSION_SUMMARY_LIMIT);
      return;
    }

    if (selection.kind === 'ambiguous') {
      stream.markdown(
        `⚠️ Mais de uma sessão corresponde a \`${escapeCell(selection.query)}\`. Refine o termo:\n`,
      );
      for (const alias of selection.matches.slice(0, 8)) {
        stream.markdown(`- ${escapeCell(alias)}\n`);
      }
      stream.markdown('\n');
      return;
    }

    const alias = selection.alias;
    const scoped = filtered.filter((event) => getEventSessionAlias(event) === alias);
    const shown = scoped.slice(0, limit);

    const sourceCounts = summarizeBySource(scoped);
    const uniqueSpecs = new Set(scoped.map((event) => event.specId).filter(Boolean));

    stream.markdown(
      `**🔎 Sessão canônica** — \`${escapeCell(alias)}\`\n\n` +
        `Eventos: ${scoped.length} (mostrando ${shown.length}) | ` +
        `Specs: ${uniqueSpecs.size} | ` +
        `audit: ${sourceCounts.audit}, trace: ${sourceCounts.trace}, log: ${sourceCounts.log}\n\n` +
        '| Timestamp | Tipo | Contexto | Resumo |\n' +
        '|---|---|---|---|\n',
    );

    for (const event of shown) {
      const context = buildContext(event);
      stream.markdown(
        `| ${escapeCell(event.timestamp)} | ${event.source} | ${escapeCell(context)} | ${escapeCell(clip(event.summary, 120))} |\n`,
      );
    }

    stream.markdown(
      '\nUso: `@speckit /history session "<alias>"`, `@speckit /history session implementador trace 30`.\n',
    );
    return;
  }

  const shown = filtered.slice(0, limit);

  emitSessionSummary(stream, filtered, DEFAULT_SESSION_SUMMARY_LIMIT);

  stream.markdown(
    `**🕘 History** — ${shown.length} de ${filtered.length} evento(s) ` +
      `(filtro: \`${filter}\`)\n\n` +
      '| Timestamp | Tipo | Contexto | Resumo |\n' +
      '|---|---|---|---|\n',
  );

  for (const event of shown) {
    const context = buildContext(event);
    stream.markdown(
      `| ${escapeCell(event.timestamp)} | ${event.source} | ${escapeCell(context)} | ${escapeCell(clip(event.summary, 120))} |\n`,
    );
  }

  stream.markdown(
    '\nUso: `@speckit /history`, `@speckit /history audit`, `@speckit /history trace 50`, `@speckit /history log 100`, `@speckit /history sessions 8`, `@speckit /history session implementador`.\n',
  );
}

function parseHistoryArgs(raw: string): HistoryArgs {
  const tokens = tokenizeArgs(raw);

  let filter: HistoryFilter = 'all';
  let limit = DEFAULT_LIMIT;
  let view: HistoryView = 'events';
  let sessionQuery: string | undefined;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const normalized = token.toLowerCase();

    if (
      normalized === 'all' ||
      normalized === 'audit' ||
      normalized === 'trace' ||
      normalized === 'log'
    ) {
      filter = normalized;
      continue;
    }

    if (normalized === 'sessions') {
      view = 'sessions';
      continue;
    }

    if (normalized === 'session') {
      view = 'session';
      const next = tokens[i + 1];
      if (next) {
        sessionQuery = next;
        i += 1;
      }
      continue;
    }

    if (normalized.startsWith('session:')) {
      view = 'session';
      const query = token.slice('session:'.length).trim();
      if (query.length > 0) {
        sessionQuery = query;
      }
      continue;
    }

    const maybeNumber = Number(normalized);
    if (Number.isFinite(maybeNumber) && maybeNumber > 0) {
      limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(maybeNumber)));
    }
  }

  return { filter, limit, view, sessionQuery };
}

function tokenizeArgs(raw: string): string[] {
  const tokens = raw.match(/"[^"]+"|'[^']+'|\S+/g) ?? [];
  return tokens
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const quotedWithDouble = token.startsWith('"') && token.endsWith('"');
      const quotedWithSingle = token.startsWith("'") && token.endsWith("'");
      if (!quotedWithDouble && !quotedWithSingle) return token;
      return token.slice(1, -1).trim();
    })
    .filter(Boolean);
}

async function loadAuditEvents(workspaceRoot: string, fs: IFileSystem): Promise<HistoryEvent[]> {
  const audit = new AuditLogger(workspaceRoot, fs);
  const lines = await audit.readLog();
  const events: HistoryEvent[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\[(.+?)\]\s+([^:]+):\s*(.*)$/);
    if (!match) continue;

    const timestamp = match[1];
    const eventType = match[2].trim();
    const detail = match[3].trim();
    const { cleanDetail, context } = splitAuditDetail(detail);

    events.push({
      timestamp,
      order: index,
      source: 'audit',
      summary: `${eventType}: ${cleanDetail}`,
      command: context.command,
      specId: context.specId,
      agentMode: context.agentMode,
      gate: parseGate(context.gate),
      sessionAlias: context.sessionAlias,
    });
  }

  return events;
}

async function loadTraceEvents(workspaceRoot: string, fs: IFileSystem): Promise<HistoryEvent[]> {
  const tm = new TraceabilityManager(workspaceRoot, fs);
  const traces = await tm.list();
  const events: HistoryEvent[] = [];

  let order = 0;
  for (const trace of traces) {
    for (const entry of trace.entries) {
      events.push({
        timestamp: entry.timestamp,
        order: order++,
        source: 'trace',
        summary: `${entry.type}: ${entry.description}`,
        command: entry.data.command,
        specId: trace.specId,
        agentMode: entry.data.agentMode,
        gate: parseGate(entry.data.gate),
        sessionAlias: entry.data.sessionAlias,
      });
    }
  }

  return events;
}

async function loadSessionLogEvents(
  workspaceRoot: string,
  fs: IFileSystem,
): Promise<HistoryEvent[]> {
  const logsDir = path.join(workspaceRoot, '.speckit', 'logs');
  let fileNames: string[];
  try {
    fileNames = await fs.listDir(logsDir);
  } catch {
    return [];
  }

  const sessionFiles = fileNames.filter(
    (name) => name.startsWith('session-') && name.endsWith('.md'),
  );

  const events: HistoryEvent[] = [];
  for (const fileName of sessionFiles) {
    const filePath = path.join(logsDir, fileName);
    let content: string;
    try {
      content = await fs.readFile(filePath);
    } catch {
      continue;
    }
    events.push(...parseSessionLogContent(content));
  }

  return events;
}

function parseSessionLogContent(content: string): HistoryEvent[] {
  const normalized = content.replace(/\r\n/g, '\n');
  const sections = normalized
    .split('\n## ')
    .map((chunk, idx) => (idx === 0 ? chunk : `## ${chunk}`))
    .filter((chunk) => chunk.startsWith('## '));

  const events: HistoryEvent[] = [];

  for (const section of sections) {
    const lines = section.split('\n');
    const header = lines[0] ?? '';
    const headerMatch = header.match(/^##\s+(.+?)\s+—\s+@speckit\s+(.+)$/);
    if (!headerMatch) continue;

    const timestamp = toIsoTimestamp(headerMatch[1].trim());
    const command = headerMatch[2].trim();

    let specId: string | undefined;
    let specTitle: string | undefined;
    let outcome = '';
    let sessionAlias: string | undefined;
    let agentMode: string | undefined;
    let gate: number | undefined;

    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (line.startsWith('**Spec:**')) {
        const value = line.replace('**Spec:**', '').trim();
        const [idPart, ...titleParts] = value.split(' — ');
        specId = idPart?.trim();
        specTitle = titleParts.join(' — ').trim() || undefined;
      } else if (line.startsWith('**Resultado:**')) {
        outcome = line.replace('**Resultado:**', '').trim();
      } else if (line.startsWith('SessionAlias:')) {
        sessionAlias = line.replace('SessionAlias:', '').trim();
      } else if (line.startsWith('AgentMode:')) {
        agentMode = line.replace('AgentMode:', '').trim();
      } else if (line.startsWith('Gate:')) {
        gate = parseGate(line.replace('Gate:', '').trim());
      }
    }

    const summary = specTitle
      ? `${command} — ${outcome} (${specTitle})`
      : `${command} — ${outcome}`;
    events.push({
      timestamp,
      order: events.length,
      source: 'log',
      summary,
      command,
      specId,
      agentMode,
      gate,
      sessionAlias,
    });
  }

  return events;
}

function splitAuditDetail(detail: string): {
  cleanDetail: string;
  context: Record<string, string>;
} {
  const sepIndex = detail.indexOf(' | ');
  if (sepIndex === -1) return { cleanDetail: detail, context: {} };

  const cleanDetail = detail.slice(0, sepIndex).trim();
  const contextRaw = detail.slice(sepIndex + 3).trim();
  const context: Record<string, string> = {};
  const pattern = /(\w+)="((?:\\"|[^"])*)"/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(contextRaw))) {
    context[match[1]] = match[2].replace(/\\"/g, '"');
  }

  return { cleanDetail, context };
}

function parseGate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const gate = Number(value);
  if (Number.isNaN(gate)) return undefined;
  return gate;
}

function toIsoTimestamp(value: string): string {
  if (value.includes('T')) return value;
  const parsed = Date.parse(value.replace(' ', 'T'));
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toISOString();
}

function toSortValue(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildContext(event: HistoryEvent): string {
  const parts: string[] = [];
  if (event.specId) parts.push(`spec:${event.specId}`);
  if (event.agentMode) parts.push(`agent:${event.agentMode}`);
  if (event.gate !== undefined) parts.push(`gate:${event.gate}`);
  if (event.sessionAlias) parts.push(`alias:${event.sessionAlias}`);
  if (event.command) parts.push(`cmd:${event.command}`);
  return parts.length > 0 ? parts.join(', ') : '—';
}

function emitSessionSummary(
  stream: vscode.ChatResponseStream,
  events: HistoryEvent[],
  maxGroups: number,
): SessionGroup[] {
  const groups = groupBySessionAlias(events).slice(0, maxGroups);
  if (groups.length === 0) return [];

  stream.markdown(
    `**Sessões canônicas (top ${groups.length} por volume):**\n\n` +
      '| Alias | Eventos | Último evento | Specs |\n' +
      '|---|---|---|---|\n',
  );

  for (const group of groups) {
    stream.markdown(
      `| ${escapeCell(group.alias)} | ${group.count} | ${escapeCell(group.latestTimestamp)} | ${group.specs.size} |\n`,
    );
  }

  stream.markdown('\n');
  return groups;
}

function groupBySessionAlias(events: HistoryEvent[]): SessionGroup[] {
  const map = new Map<string, SessionGroup>();

  for (const event of events) {
    const alias = getEventSessionAlias(event);
    const current = map.get(alias);

    if (!current) {
      map.set(alias, {
        alias,
        count: 1,
        latestTimestamp: event.timestamp,
        specs: new Set(event.specId ? [event.specId] : []),
      });
      continue;
    }

    current.count += 1;
    if (toSortValue(event.timestamp) > toSortValue(current.latestTimestamp)) {
      current.latestTimestamp = event.timestamp;
    }
    if (event.specId) current.specs.add(event.specId);
  }

  return [...map.values()].sort(
    (a, b) => b.count - a.count || toSortValue(b.latestTimestamp) - toSortValue(a.latestTimestamp),
  );
}

function getEventSessionAlias(event: HistoryEvent): string {
  return event.sessionAlias || NO_ALIAS_CANONICAL;
}

function resolveSessionAlias(
  events: HistoryEvent[],
  query: string | undefined,
): SessionAliasSelection {
  const normalizedQuery = (query || '').trim().toLowerCase();
  if (!normalizedQuery) return { kind: 'missing-query' };

  const aliases = groupBySessionAlias(events).map((group) => group.alias);
  const exact = aliases.find((alias) => alias.toLowerCase() === normalizedQuery);
  if (exact) return { kind: 'ok', alias: exact };

  const contains = aliases.filter((alias) => alias.toLowerCase().includes(normalizedQuery));
  if (contains.length === 1) return { kind: 'ok', alias: contains[0] };
  if (contains.length === 0) return { kind: 'not-found', query: query || '' };

  return { kind: 'ambiguous', query: query || '', matches: contains };
}

function summarizeBySource(events: HistoryEvent[]): Record<HistorySource, number> {
  const counts: Record<HistorySource, number> = {
    audit: 0,
    trace: 0,
    log: 0,
  };

  for (const event of events) {
    counts[event.source] += 1;
  }

  return counts;
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function escapeCell(value: string): string {
  return value
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}
