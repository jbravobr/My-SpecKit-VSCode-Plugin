import { Router, Request, Response } from 'express';
import * as path from 'path';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';
import { generateFixTemplate } from '../../../../src/fix/FixTemplate';
import { generateFixId } from '../../../../src/generator/utils/SpecIdGenerator';

const router = Router();

router.post('/fix', async (req: Request, res: Response) => {
  const { workspaceRoot } = req.body as { workspaceRoot: string };
  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  try {
    const workspace = createNodeWorkspace(workspaceRoot);
    const specDir = path.join(workspaceRoot, '.speckit');
    await nodeFileSystem.ensureDir(specDir);

    const existing = await workspace.listFixFiles(specDir);
    const specId = generateFixId(workspaceRoot, existing);
    const fileName = `${specId}.md`;
    const filePath = path.join(specDir, fileName);

    const content = generateFixTemplate(specId);
    await nodeFileSystem.writeFile(filePath, content);

    res.json({
      specId,
      fileName,
      filePath,
      content,
      markdown:
        `✅ Fix criado: \`${fileName}\`\n\n` +
        'Preencha as seções marcadas com `<!-- TODO -->`. Quando terminar, use `/validate` para verificar completude.\n\n' +
        '### Seções obrigatórias\n' +
        '- Bug Description (título, sintomas, passos para reproduzir)\n' +
        '- Root Cause Hypothesis (hipótese)\n' +
        '- Impact Assessment (severidade)\n' +
        '- Regression Prevention (testes a adicionar)\n' +
        '- DoF (Definition of Fixed)',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
