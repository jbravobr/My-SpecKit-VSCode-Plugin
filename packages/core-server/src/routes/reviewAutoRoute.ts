import { Router, Request, Response } from 'express';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';
import { parseStory } from '../../../../src/story/StoryParser';
import { validateStory } from '../../../../src/story/StoryValidator';
import {
  validateGateTransition,
  validateStatusTransition,
} from '../../../../src/workflow/GateEnforcer';

const router = Router();

router.post('/review-auto', async (req: Request, res: Response) => {
  const { workspaceRoot, specFile } = req.body as {
    workspaceRoot: string;
    specFile?: string;
  };

  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  try {
    const workspace = createNodeWorkspace(workspaceRoot);
    const activeSpecPath = specFile ?? (await workspace.getActiveSpecPath());

    if (!activeSpecPath) {
      res.status(404).json({
        error: 'Nenhuma spec ativa encontrada',
        markdown: '❌ Nenhuma spec ativa encontrada. Use `/new` para criar uma.',
      });
      return;
    }

    const content = await nodeFileSystem.readFile(activeSpecPath);
    const story = parseStory(content);
    const validation = validateStory(story);

    const currentGate = story.metadata.gate ?? 0;
    const currentStatus = story.metadata.status ?? 'open';
    const gateTransition = validateGateTransition(
      currentGate,
      Math.min(currentGate + 1, 4) as 0 | 1 | 2 | 3 | 4,
    );
    const statusTransition = validateStatusTransition(currentStatus, 'review');

    const canAdvance = validation.valid && currentGate < 4;

    let markdown: string;
    if (!validation.valid) {
      markdown =
        `## ❌ Review Auto — Bloqueado\n\n` +
        `Spec: \`${activeSpecPath}\`\n\n` +
        `A spec possui ${validation.gaps.length} lacuna(s) — complete antes de avançar para revisão:\n\n` +
        validation.gaps.map((g) => `- ${g}`).join('\n');
    } else if (currentGate >= 3) {
      markdown =
        `## ✅ Review Auto — Em Revisão\n\n` +
        `Spec: \`${activeSpecPath}\`\n\n` +
        `Gate atual: ${currentGate}. Status: \`${currentStatus}\`.\n\n` +
        `A spec já está em fase de revisão/entrega.`;
    } else {
      markdown =
        `## 🔄 Review Auto — Pronta para Avanço\n\n` +
        `Spec: \`${activeSpecPath}\`\n\n` +
        `Gate atual: ${currentGate} → Gate ${currentGate + 1}\n` +
        `Status: \`${currentStatus}\`\n\n` +
        `✅ Spec válida. ${gateTransition.allowed ? 'Transição de gate permitida.' : (gateTransition.reason ?? '')}\n` +
        `✅ ${statusTransition.allowed ? 'Transição de status para `review` permitida.' : (statusTransition.reason ?? '')}`;
    }

    res.json({
      specPath: activeSpecPath,
      valid: validation.valid,
      gaps: validation.gaps,
      currentGate,
      currentStatus,
      canAdvance,
      markdown,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
