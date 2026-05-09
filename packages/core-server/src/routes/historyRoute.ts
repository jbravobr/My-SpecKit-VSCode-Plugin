import { Router, Request, Response } from 'express';
import * as path from 'path';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { AuditLogger } from '../../../../src/workflow/AuditLogger';
import { TraceabilityManager } from '../../../../src/workflow/TraceabilityManager';

const router = Router();

interface HistoryEvent {
  timestamp: string;
  source: 'audit' | 'trace' | 'log';
  summary: string;
  specId?: string;
  command?: string;
}

router.get('/history', async (req: Request, res: Response) => {
  const workspaceRoot = req.query.workspaceRoot as string;
  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  const limit = Math.max(1, Math.min(200, parseInt((req.query.limit as string) ?? '50', 10) || 50));
  const filter = (req.query.filter as string) ?? 'all';

  try {
    const events: HistoryEvent[] = [];

    // Audit events
    const audit = new AuditLogger(workspaceRoot, nodeFileSystem);
    const auditLines = await audit.readLog();
    for (const line of auditLines) {
      const match = line.match(/^\[(.+?)\]\s+([^:]+):\s*(.*)$/);
      if (!match) continue;
      events.push({
        timestamp: match[1],
        source: 'audit',
        summary: `${match[2].trim()}: ${match[3].trim()}`,
      });
    }

    // Trace events
    const tm = new TraceabilityManager(workspaceRoot, nodeFileSystem);
    const traces = await tm.list();
    for (const trace of traces) {
      for (const entry of trace.entries) {
        events.push({
          timestamp: entry.timestamp,
          source: 'trace',
          summary: `${entry.type}: ${entry.description}`,
          specId: trace.specId,
          command: entry.data.command,
        });
      }
    }

    // Session log events
    try {
      const logsDir = path.join(workspaceRoot, '.speckit', 'logs');
      const logFiles = await nodeFileSystem.listDir(logsDir);
      for (const file of logFiles.filter((f) => f.startsWith('session-') && f.endsWith('.md'))) {
        try {
          const content = await nodeFileSystem.readFile(path.join(logsDir, file));
          const sections = content.split('\n## ').slice(1);
          for (const section of sections) {
            const lines = `## ${section}`.split('\n');
            const headerMatch = lines[0].match(/^##\s+(.+?)\s+—\s+@speckit\s+(.+)$/);
            if (!headerMatch) continue;
            events.push({
              timestamp: headerMatch[1].trim(),
              source: 'log',
              summary: `${headerMatch[2].trim()}`,
            });
          }
        } catch {
          // skip unreadable log
        }
      }
    } catch {
      // no logs dir
    }

    // Sort by timestamp descending
    events.sort((a, b) => {
      const ta = Date.parse(a.timestamp) || 0;
      const tb = Date.parse(b.timestamp) || 0;
      return tb - ta;
    });

    const filtered = filter === 'all' ? events : events.filter((e) => e.source === filter);
    const shown = filtered.slice(0, limit);

    res.json({
      events: shown,
      total: filtered.length,
      shown: shown.length,
      filter,
      markdown:
        `## 🕘 History\n\n${shown.length} de ${filtered.length} evento(s) (filtro: \`${filter}\`)\n\n` +
        '| Timestamp | Tipo | Resumo |\n|---|---|---|\n' +
        shown
          .map(
            (e) =>
              `| ${e.timestamp} | ${e.source} | ${e.summary.replace(/\|/g, '\\|').slice(0, 100)} |`,
          )
          .join('\n'),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
