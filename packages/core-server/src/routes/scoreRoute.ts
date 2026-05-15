import { Router, Request, Response } from 'express';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';
import { parseStory } from '../../../../src/story/StoryParser';
import { scoreStory } from '../../../../src/workflow/SpecCompletenessScorer';

const router = Router();

export function levelEmoji(level: string): string {
  switch (level) {
    case 'excelente':
      return '🌟';
    case 'alta':
      return '✅';
    case 'média':
      return '⚠️';
    default:
      return '🛑';
  }
}

export function buildScoreMarkdown(
  storyId: string,
  report: ReturnType<typeof scoreStory>,
): string {
  const lines: string[] = [];
  lines.push(
    `## ${levelEmoji(report.level)} Score da Spec — \`STORY-${storyId}\`: **${report.score}/100** (${report.level})`,
  );
  lines.push('');
  lines.push('| Dimensão | Peso | Obtido |');
  lines.push('|---|---:|---:|');
  for (const b of report.breakdown) {
    lines.push(`| ${b.label} | ${b.weight} | ${b.earned} |`);
  }
  lines.push('');
  if (report.recommendations.length > 0) {
    lines.push('### Recomendações para subir o score:');
    for (const r of report.recommendations) lines.push(`- ${r}`);
  } else {
    lines.push('✅ Nenhuma lacuna estrutural detectada.');
  }
  return lines.join('\n') + '\n';
}

router.get('/score', async (req: Request, res: Response) => {
  const workspaceRoot = req.query.workspaceRoot as string;
  const requestedSpecPath = req.query.specPath as string | undefined;
  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  try {
    const workspace = createNodeWorkspace(workspaceRoot);
    const specPath = requestedSpecPath ?? (await workspace.getActiveSpecPath());
    if (!specPath) {
      res.status(404).json({
        error: 'Nenhuma spec ativa em `.speckit/`.',
        markdown:
          '❌ Nenhuma spec ativa em `.speckit/`. Use `/new` ou abra um arquivo de spec antes de `/score`.\n',
      });
      return;
    }

    const content = await nodeFileSystem.readFile(specPath);
    const story = parseStory(content);
    const report = scoreStory(story);
    const markdown = buildScoreMarkdown(story.metadata.id, report);
    res.json({
      specPath,
      score: report.score,
      level: report.level,
      breakdown: report.breakdown,
      recommendations: report.recommendations,
      markdown,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message, markdown: `❌ Erro ao calcular score da spec: ${message}` });
  }
});

export default router;
