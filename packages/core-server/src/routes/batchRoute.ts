import { Router, Request, Response } from 'express';
import * as path from 'path';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';
import { parseStory } from '../../../../src/story/StoryParser';
import { validateStory } from '../../../../src/story/StoryValidator';
import { parseFix } from '../../../../src/fix/FixParser';
import { validateFix } from '../../../../src/fix/FixValidator';

const router = Router();

router.post('/batch', async (req: Request, res: Response) => {
  const { workspaceRoot, generate, unified } = req.body as {
    workspaceRoot: string;
    generate?: boolean;
    unified?: boolean;
  };

  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  try {
    const workspace = createNodeWorkspace(workspaceRoot);
    const specDir = path.join(workspaceRoot, '.speckit');

    const [storyFiles, fixFiles] = await Promise.all([
      workspace.listStoryFiles(specDir),
      workspace.listFixFiles(specDir),
    ]);

    const results: Array<{
      fileName: string;
      specType: 'story' | 'fix';
      valid: boolean;
      gaps: string[];
      title: string;
      id: string;
      gate: number;
      status: string;
      error?: string;
    }> = [];

    for (const name of storyFiles.sort()) {
      try {
        const content = await nodeFileSystem.readFile(path.join(specDir, name));
        const story = parseStory(content);
        if (story.metadata.status === 'done' || story.metadata.status === 'cancelled') continue;
        const result = validateStory(story);
        results.push({
          fileName: name,
          specType: 'story',
          valid: result.valid,
          gaps: result.gaps,
          title: story.metadata.title || '',
          id: story.metadata.id || name,
          gate: story.metadata.gate ?? 0,
          status: story.metadata.status || 'open',
        });
      } catch (e) {
        results.push({
          fileName: name,
          specType: 'story',
          valid: false,
          gaps: ['Erro ao processar arquivo'],
          title: '',
          id: name,
          gate: 0,
          status: 'open',
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    for (const name of fixFiles.sort()) {
      try {
        const content = await nodeFileSystem.readFile(path.join(specDir, name));
        const fix = parseFix(content);
        if (fix.metadata.status === 'done' || fix.metadata.status === 'cancelled') continue;
        const result = validateFix(fix);
        results.push({
          fileName: name,
          specType: 'fix',
          valid: result.valid,
          gaps: result.gaps,
          title: fix.metadata.title || '',
          id: fix.metadata.id || name,
          gate: fix.metadata.gate ?? 0,
          status: fix.metadata.status || 'open',
        });
      } catch (e) {
        results.push({
          fileName: name,
          specType: 'fix',
          valid: false,
          gaps: ['Erro ao processar arquivo'],
          title: '',
          id: name,
          gate: 0,
          status: 'open',
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    const validCount = results.filter((r) => r.valid).length;
    const invalidCount = results.filter((r) => !r.valid).length;

    let markdown =
      `## 📦 Batch — ${results.length} spec(s) processada(s)\n\n` +
      `✅ Válidas: ${validCount} | ❌ Inválidas: ${invalidCount}\n\n` +
      '| Arquivo | Tipo | Status | Gate | Válida | Lacunas |\n|---|---|---|---|---|---|\n' +
      results
        .map(
          (r) =>
            `| \`${r.fileName}\` | ${r.specType} | ${r.status} | ${r.gate} | ${r.valid ? '✅' : '❌'} | ${r.gaps.length} |`,
        )
        .join('\n');

    if (generate) {
      markdown += `\n\n> ℹ️ Flag \`--generate\` detectada. Geração de config Copilot não suportada via Core Server — use o plugin VS Code para gerar \`.github/copilot-instructions.md\`.`;
    }
    if (unified) {
      markdown += `\n\n> ℹ️ Flag \`--unified\` detectada. Agentes unificados não suportados via Core Server — use o plugin VS Code.`;
    }

    res.json({
      results,
      validCount,
      invalidCount,
      generate: !!generate,
      unified: !!unified,
      markdown,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
