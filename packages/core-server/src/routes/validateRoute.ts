import { Router, Request, Response } from 'express';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';
import { parseStory } from '../../../../src/story/StoryParser';
import { validateStory } from '../../../../src/story/StoryValidator';
import { parseFix } from '../../../../src/fix/FixParser';
import { validateFix } from '../../../../src/fix/FixValidator';

const router = Router();

router.post('/validate', async (req: Request, res: Response) => {
  const { workspaceRoot, specPath } = req.body as {
    workspaceRoot: string;
    specPath?: string;
  };

  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  try {
    const workspace = createNodeWorkspace(workspaceRoot);
    const activeSpecPath = specPath ?? (await workspace.getActiveSpecPath());

    if (!activeSpecPath) {
      res.status(404).json({
        error: 'Nenhuma spec ativa encontrada',
        markdown: '❌ Nenhuma spec ativa encontrada. Use `/new` para criar uma.',
      });
      return;
    }

    const content = await nodeFileSystem.readFile(activeSpecPath);
    const isFix = activeSpecPath.includes('FIX-');

    if (isFix) {
      const fix = parseFix(content);
      const result = validateFix(fix);
      res.json({
        valid: result.valid,
        gaps: result.gaps,
        specPath: activeSpecPath,
        markdown: result.valid
          ? `✅ Fix validado com sucesso: \`${activeSpecPath}\``
          : `❌ Fix inválido — ${result.gaps.length} lacuna(s):\n${result.gaps.map((g) => `- ${g}`).join('\n')}`,
      });
    } else {
      const story = parseStory(content);
      const result = validateStory(story);
      res.json({
        valid: result.valid,
        gaps: result.gaps,
        specPath: activeSpecPath,
        markdown: result.valid
          ? `✅ Story validada com sucesso: \`${activeSpecPath}\``
          : `❌ Story inválida — ${result.gaps.length} lacuna(s):\n${result.gaps.map((g) => `- ${g}`).join('\n')}`,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
