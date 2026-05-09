import { Router, Request, Response } from 'express';
import { gitOps } from '../../../../src/workflow/GitOperations';

const router = Router();

router.post('/commit', async (req: Request, res: Response) => {
  const { workspaceRoot, message } = req.body as {
    workspaceRoot: string;
    message?: string;
  };

  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  try {
    const commitMessage = message ?? 'chore(speckit): commit via IntelliJ SpecKit plugin';
    const output = await gitOps.commit(workspaceRoot, commitMessage);
    res.json({
      success: true,
      output,
      markdown: `✅ Commit realizado:\n\`\`\`\n${output}\n\`\`\``,
    });
  } catch (err: unknown) {
    const message2 = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message2, markdown: `❌ Erro ao commitar: ${message2}` });
  }
});

export default router;
