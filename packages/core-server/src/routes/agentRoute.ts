import { Router, Request, Response } from 'express';
import { AGENT_MODES, getAgentModeLabel } from '../../../../src/participant/AgentMode';

const router = Router();

router.get('/agent', (_req: Request, res: Response) => {
  const modes = AGENT_MODES.map((mode) => ({
    mode,
    label: getAgentModeLabel(mode),
  }));

  const markdown =
    '## 🤖 Agent Modes\n\n' +
    '| Modo | Descrição |\n|---|---|\n' +
    modes.map((m) => `| \`${m.mode}\` | ${m.label} |`).join('\n') +
    '\n\nUse `/agent <modo>` para alternar o modo ativo.';

  res.json({ modes, markdown });
});

export default router;
