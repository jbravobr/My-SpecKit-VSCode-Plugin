import { Router, Request, Response } from 'express';
import { gitOps } from '../../../../src/workflow/GitOperations';

const router = Router();

router.get('/diff', async (req: Request, res: Response) => {
  const workspaceRoot = (req.query.workspaceRoot as string) || process.cwd();
  const full = req.query.full === 'true';

  try {
    const output = await gitOps.diff(workspaceRoot, full);
    res.json({
      diff: output,
      markdown: output
        ? `\`\`\`diff\n${output}\n\`\`\``
        : '✅ Nenhuma mudança pendente (working tree limpa)',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
