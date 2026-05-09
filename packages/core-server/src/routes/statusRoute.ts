import { Router, Request, Response } from 'express';
import * as path from 'path';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';
import { parseStory } from '../../../../src/story/StoryParser';
import { parseFix } from '../../../../src/fix/FixParser';

const router = Router();

router.get('/status', async (req: Request, res: Response) => {
  const workspaceRoot = (req.query.workspaceRoot as string) || process.cwd();
  const includeClosed = req.query.all === 'true';

  try {
    const workspace = createNodeWorkspace(workspaceRoot);
    const specDir = path.join(workspaceRoot, '.speckit');
    const [storyFiles, fixFiles] = await Promise.all([
      workspace.listStoryFiles(specDir),
      workspace.listFixFiles(specDir),
    ]);

    const stories = await Promise.all(
      storyFiles.sort().map(async (name) => {
        try {
          const content = await nodeFileSystem.readFile(path.join(specDir, name));
          const story = parseStory(content);
          const isClosed =
            story.metadata.status === 'done' || story.metadata.status === 'cancelled';
          if (isClosed && !includeClosed) return null;
          return {
            name,
            title: story.metadata.title,
            status: story.metadata.status,
            gate: story.metadata.gate,
            language: story.technicalSpec.language,
            framework: story.technicalSpec.framework,
          };
        } catch {
          return null;
        }
      }),
    );

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

    res.json({
      stories: stories.filter(Boolean),
      fixes: fixes.filter(Boolean),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
