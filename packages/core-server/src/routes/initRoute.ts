import { Router, Request, Response } from 'express';
import * as path from 'path';
import { nodeFileSystem } from '../fs/NodeFileSystem';

const router = Router();

router.post('/init', async (req: Request, res: Response) => {
  const { workspaceRoot } = req.body as { workspaceRoot: string };
  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  try {
    const specDir = path.join(workspaceRoot, '.speckit');
    const speckitExisted = await nodeFileSystem.fileExists(specDir);
    await nodeFileSystem.ensureDir(specDir);

    const subDirs = ['traceability', 'logs', 'context'];
    const created: string[] = [];

    if (!speckitExisted) {
      created.push('.speckit/');
    }

    for (const sub of subDirs) {
      const subPath = path.join(specDir, sub);
      const existed = await nodeFileSystem.fileExists(subPath);
      if (!existed) {
        await nodeFileSystem.ensureDir(subPath);
        created.push(`.speckit/${sub}/`);
      }
    }

    // Create a default defaults.yml if it doesn't exist
    const defaultsPath = path.join(specDir, 'defaults.yml');
    const defaultsExisted = await nodeFileSystem.fileExists(defaultsPath);
    if (!defaultsExisted) {
      await nodeFileSystem.writeFile(
        defaultsPath,
        '# SpecKit defaults — customize as needed\n# language: typescript\n# framework: react\n# architecture: hexagonal\n',
      );
      created.push('.speckit/defaults.yml');
    }

    const dirStatus = speckitExisted ? 'já existia' : 'criado';
    const markdown =
      `## ✅ Workspace inicializado\n\n` +
      `📁 \`.speckit/\` — ${dirStatus}\n` +
      (created.length > 0
        ? `\n📄 Criados:\n${created.map((c) => `- \`${c}\``).join('\n')}\n`
        : '\nNenhum arquivo novo criado.\n') +
      '\nUse `/new` para criar uma nova story ou `/fix` para criar um fix.';

    res.json({ created, specDir, markdown });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
