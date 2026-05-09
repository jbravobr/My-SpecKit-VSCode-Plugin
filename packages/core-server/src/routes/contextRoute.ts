import { Router, Request, Response } from 'express';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { ContextManager } from '../../../../src/workflow/ContextManager';

const router = Router();

router.get('/context', async (req: Request, res: Response) => {
  const workspaceRoot = req.query.workspaceRoot as string;
  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  try {
    const cm = new ContextManager(workspaceRoot, nodeFileSystem);
    const files = await cm.list();

    if (files.length === 0) {
      res.json({
        files: [],
        markdown:
          '## 📂 Contexto\n\nNenhum arquivo de contexto adicionado.\n\nUse `/context add <caminho>` para adicionar arquivos.',
      });
      return;
    }

    res.json({
      files,
      markdown:
        `## 📂 Contexto ativo\n\n${files.length} arquivo(s) selecionados.\n\n` +
        files.map((f) => `- \`${f}\``).join('\n'),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
