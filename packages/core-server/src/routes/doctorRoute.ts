import { Router, Request, Response } from 'express';
import * as path from 'path';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';

const router = Router();

router.get('/doctor', async (req: Request, res: Response) => {
  const workspaceRoot = req.query.workspaceRoot as string;
  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  try {
    const workspace = createNodeWorkspace(workspaceRoot);
    const specDir = path.join(workspaceRoot, '.speckit');
    const githubDir = path.join(workspaceRoot, '.github');
    const defaultsPath = path.join(specDir, 'defaults.yml');

    const [speckitExists, githubExists, defaultsExists, storyFiles, fixFiles, techStack] =
      await Promise.all([
        nodeFileSystem.fileExists(specDir),
        nodeFileSystem.fileExists(githubDir),
        nodeFileSystem.fileExists(defaultsPath),
        workspace.listStoryFiles(specDir).catch(() => [] as string[]),
        workspace.listFixFiles(specDir).catch(() => [] as string[]),
        workspace.detectTechStack().catch(() => null),
      ]);

    const checks = [
      { label: '.speckit/', ok: speckitExists },
      { label: '.github/', ok: githubExists },
      { label: 'defaults.yml', ok: defaultsExists },
      {
        label: 'Stories',
        ok: storyFiles.length > 0,
        detail: `${storyFiles.length} encontrada(s)`,
      },
      { label: 'Fixes', ok: fixFiles.length > 0, detail: `${fixFiles.length} encontrado(s)` },
      {
        label: 'Tech Stack',
        ok: techStack !== null,
        detail: techStack
          ? `${techStack.language} / ${techStack.framework} (${techStack.confidence})`
          : 'não detectado',
      },
    ];

    const healthy = checks.filter((c) => c.ok).length;
    const total = checks.length;

    const lines = checks.map((c) => {
      const icon = c.ok ? '✅' : '❌';
      const detail = c.detail ? ` — ${c.detail}` : '';
      return `| ${icon} | ${c.label}${detail} |`;
    });

    res.json({
      checks,
      healthy,
      total,
      markdown:
        `## 🩺 Diagnóstico do Workspace\n\n` +
        `| Status | Item |\n|--------|------|\n${lines.join('\n')}\n\n` +
        `**Resultado:** ${healthy}/${total} verificações OK`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
