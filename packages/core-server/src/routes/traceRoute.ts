import { Router, Request, Response } from 'express';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { TraceabilityManager } from '../../../../src/workflow/TraceabilityManager';

const router = Router();

router.get('/trace', async (req: Request, res: Response) => {
  const workspaceRoot = req.query.workspaceRoot as string;
  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  const specId = req.query.specId as string | undefined;

  try {
    const tm = new TraceabilityManager(workspaceRoot, nodeFileSystem);

    if (specId) {
      const trace = await tm.load(specId);
      if (!trace) {
        res.status(404).json({
          error: `Nenhum trace encontrado para ${specId}`,
          markdown: `❌ Nenhum trace encontrado para \`${specId}\`.`,
        });
        return;
      }
      res.json({
        trace,
        markdown:
          `## 🔗 Trace — \`${trace.specId}\`\n\n` +
          `| Campo | Valor |\n|---|---|\n` +
          `| Tipo | ${trace.specType} |\n` +
          `| Criado | ${trace.createdAt} |\n` +
          `| Atualizado | ${trace.updatedAt} |\n` +
          `| Entradas | ${trace.entries.length} |\n\n` +
          '### Histórico\n\n' +
          trace.entries
            .map((e) => {
              const data = Object.entries(e.data)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
              return `- **${e.timestamp}** — \`${e.type}\`: ${e.description}${data ? ` (${data})` : ''}`;
            })
            .join('\n'),
      });
      return;
    }

    const traces = await tm.list();
    if (traces.length === 0) {
      res.json({
        traces: [],
        markdown: '## 🔗 Rastreabilidade\n\nNenhum registro de rastreabilidade encontrado.',
      });
      return;
    }

    res.json({
      traces: traces.map((t) => ({
        specId: t.specId,
        specType: t.specType,
        entryCount: t.entries.length,
        updatedAt: t.updatedAt,
      })),
      markdown:
        `## 🔗 Rastreabilidade\n\n${traces.length} spec(s) com trilha registrada.\n\n` +
        '| Spec ID | Tipo | Entradas | Última atualização |\n|---|---|---|---|\n' +
        traces
          .map((t) => `| \`${t.specId}\` | ${t.specType} | ${t.entries.length} | ${t.updatedAt} |`)
          .join('\n'),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
