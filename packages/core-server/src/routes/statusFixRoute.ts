import { Router, Request, Response } from 'express';
import * as path from 'path';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';
import { parseFix } from '../../../../src/fix/FixParser';

const router = Router();

router.get('/status-fix', async (req: Request, res: Response) => {
  const workspaceRoot = (req.query.workspaceRoot as string) || process.cwd();
  const includeClosed = req.query.all === 'true';

  try {
    const workspace = createNodeWorkspace(workspaceRoot);
    const specDir = path.join(workspaceRoot, '.speckit');
    const fixFiles = await workspace.listFixFiles(specDir);

    const fixes = await Promise.all(
      fixFiles.sort().map(async (name) => {
        try {
          const content = await nodeFileSystem.readFile(path.join(specDir, name));
          const fix = parseFix(content);
          const isClosed = fix.metadata.status === 'done' || fix.metadata.status === 'cancelled';
          if (isClosed && !includeClosed) return null;
          return {
            name,
            title: fix.metadata.title,
            status: fix.metadata.status,
            gate: fix.metadata.gate,
            severity: fix.impactAssessment.severity,
          };
        } catch {
          return null;
        }
      }),
    );

    const filtered = fixes.filter(Boolean);

    res.json({
      fixes: filtered,
      markdown:
        filtered.length === 0
          ? '## 🐛 Fixes\n\nNenhum fix encontrado.'
          : `## 🐛 Fixes (${filtered.length})\n\n` +
            '| Arquivo | Título | Status | Gate | Severidade |\n|---|---|---|---|---|\n' +
            filtered
              .map(
                (f) =>
                  `| \`${f!.name}\` | ${f!.title || '—'} | ${f!.status} | ${f!.gate} | ${f!.severity || '—'} |`,
              )
              .join('\n'),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
