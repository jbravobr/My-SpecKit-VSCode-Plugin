import { Router, Request, Response } from 'express';
import * as path from 'path';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';
import { generateStoryTemplate } from '../../../../src/story/StoryTemplate';
import { WorkspaceDefaults } from '../../../../src/config/WorkspaceDefaults';

const router = Router();

router.post('/new', async (req: Request, res: Response) => {
  const { workspaceRoot } = req.body as { workspaceRoot: string };
  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  try {
    const workspace = createNodeWorkspace(workspaceRoot);
    const specDir = path.join(workspaceRoot, '.speckit');
    await nodeFileSystem.ensureDir(specDir);

    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const specId = `STORY-${ts}`;
    const fileName = `${specId}.md`;
    const filePath = path.join(specDir, fileName);

    const techStack = await workspace.detectTechStack().catch(() => null);
    // TechStackDetection is structurally compatible with WorkspaceDefaults
    const defaults: WorkspaceDefaults | undefined = techStack
      ? {
          language: techStack.language,
          framework: techStack.framework,
          architecture: techStack.architecture as WorkspaceDefaults['architecture'],
          target: techStack.target,
          projectStage: techStack.projectStage,
        }
      : undefined;

    const content = generateStoryTemplate(specId, defaults);
    await nodeFileSystem.writeFile(filePath, content);

    res.json({
      specId,
      fileName,
      filePath,
      content,
      markdown: `✅ Spec criada: \`${fileName}\`\n\nAbra o arquivo e preencha os campos marcados com \`[PREENCHER]\`.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
