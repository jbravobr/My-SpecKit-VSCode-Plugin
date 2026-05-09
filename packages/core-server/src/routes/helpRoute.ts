import { Router, Request, Response } from 'express';

const router = Router();

const HELP_MARKDOWN = `
# SpecKit Core Server — API de Comandos

## Comandos disponíveis

| Rota | Método | Descrição |
|---|---|---|
| \`GET /status\` | GET | Lista specs e status |
| \`POST /new\` | POST | Cria nova story spec |
| \`POST /validate\` | POST | Valida spec ativa |
| \`POST /commit\` | POST | Commit das mudanças |
| \`GET /diff\` | GET | Exibe diff das mudanças |
| \`GET /health\` | GET | Health check do servidor |

## Parâmetros comuns

- \`workspaceRoot\`: caminho absoluto para a raiz do workspace
- Requisições POST enviam JSON no body
- Requisições GET usam query params

## Fluxo recomendado

**Story individual:**
\`/new\` → preencher spec → \`/validate\` → ciclo agente → \`/commit\`

**Fix individual:**
\`/fix\` → preencher spec → \`/validate\` → ciclo agente → \`/commit\`

**Refactoring/Debug:**
Use o agente diretamente, sem criar spec.
`;

router.get('/help', (_req: Request, res: Response) => {
  res.json({ markdown: HELP_MARKDOWN });
});

export default router;
