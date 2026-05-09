import { Router, Request, Response } from 'express';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { AuditLogger } from '../../../../src/workflow/AuditLogger';

const router = Router();

router.get('/audit', async (req: Request, res: Response) => {
  const workspaceRoot = req.query.workspaceRoot as string;
  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  const limit = Math.max(1, Math.min(200, parseInt((req.query.limit as string) ?? '50', 10) || 50));

  try {
    const audit = new AuditLogger(workspaceRoot, nodeFileSystem);
    const lines = await audit.readLog();

    if (lines.length === 0) {
      res.json({
        entries: [],
        total: 0,
        shown: 0,
        markdown: '## 📋 Audit Log\n\nNenhum registro de auditoria encontrado.',
      });
      return;
    }

    const shown = lines.slice(-limit);

    res.json({
      entries: shown,
      total: lines.length,
      shown: shown.length,
      markdown:
        `## 📋 Audit Log\n\n` +
        `Últimas ${shown.length} de ${lines.length} entradas.\n\n` +
        '```\n' +
        shown.join('\n') +
        '\n```',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
