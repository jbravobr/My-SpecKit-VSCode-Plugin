import { Router, Request, Response } from 'express';

const router = Router();

const HELP_MARKDOWN = `
# SpecKit Core Server — API de Comandos

## Comandos disponíveis

| Rota | Método | Descrição |
|---|---|---|
| \`GET /status\` | GET | Lista specs e status |
| \`GET /status-fix\` | GET | Mostra/retro-propõe status para specs fix |
| \`POST /new\` | POST | Cria nova story spec |
| \`POST /fix\` | POST | Cria nova fix spec |
| \`POST /draft\` | POST | Gera spec a partir de descrição livre |
| \`POST /validate\` | POST | Valida spec ativa |
| \`POST /verify\` | POST | Executa validação determinística por gate |
| \`POST /review-auto\` | POST | Orquestra transições de revisão (Gate 2→3→4) |
| \`POST /batch\` | POST | Processa lote e pode gerar agentes/configuração |
| \`GET /agent\` | GET | Lista modos de agente e modo ativo |
| \`POST /agent\` | POST | Propõe/confirma troca de modo de agente |
| \`GET /gate\` | GET | Mostra regras de transição de gate |
| \`GET /audit\` | GET | Exibe trilha de auditoria |
| \`GET /trace\` | GET | Exibe trilha de rastreabilidade |
| \`GET /history\` | GET | Exibe trilha agregada (audit/trace/log) |
| \`POST /commit\` | POST | Commit das mudanças |
| \`GET /diff\` | GET | Exibe diff das mudanças |
| \`GET /context\` | GET | Exibe contexto ativo do workspace |
| \`GET /doctor\` | GET | Diagnóstico operacional do workspace |
| \`POST /init\` | POST | Inicializa estrutura base do SpecKit |
| \`GET /metrics\` | GET | Resume métricas locais de validação |
| \`GET /score\` | GET | Calcula score de completude da spec ativa |
| \`GET /health\` | GET | Health check do servidor |

## Parâmetros comuns

- \`workspaceRoot\`: caminho absoluto para a raiz do workspace
- Requisições POST enviam JSON no body
- Requisições GET usam query params

## Fluxo recomendado

**Story individual:**
\`/new\` → preencher spec → \`/validate\` (gera config) → ciclo agente → \`/review-auto\` → \`/commit\`

**Fix individual:**
\`/fix\` → preencher spec → \`/validate\` (gera config) → ciclo agente → \`/review-auto\` → \`/commit\`

**Lote unificado:**
\`/batch --generate --unified\` → (se houver branch citada) escolher \`--branch-strategy session|cited\` → abrir agente por story.
`;

const STATUS_HELP_MARKDOWN = `
## Ajuda — /status

Exibe resumo de stories e fixes no workspace.

### Uso

- \`/status\`
- \`/status --all\`
- \`/status --closed\`
- \`/status --fix\`
- \`/status --fix --confirm <codigo>\` (usa o código mostrado na proposta)

### Aliases

- \`/status-all\` → \`/status --all\`
- \`/status-fix\` → \`/status --fix\`
`;

const AGENT_HELP_MARKDOWN = `
## Ajuda — /agent

Mostra ou alterna o modo de agente com confirmação explícita.

### Uso

- \`/agent\` (listar modos + modo ativo)
- \`/agent <modo>\` (propor troca e receber código de confirmação)
- \`/agent --confirm <codigo>\` (confirmar troca proposta; nada muda sem o código)

### Modos

- \`default\`
- \`implementador\`
- \`revisor\`
- \`debugger\`
- \`refactor\`
`;

const BATCH_HELP_MARKDOWN = `
## Ajuda — /batch

Processa múltiplas specs em lote.

### Uso

- \`/batch\` (somente validar lote)
- \`/batch --generate\` (geração legada)
- \`/batch --generate --unified\` (gerar agentes unificados + index)
- \`/batch --generate --unified --story <id>\` (filtrar uma story)
- \`/batch --generate --unified --branch-strategy session|cited\`
- \`/batch --generate --unified --branch-strategy session --confirm <codigo>\`

### Aliases

- \`/batch-generate\` → \`/batch --generate\`
- \`/batch-unified\` → \`/batch --generate --unified\`
`;

const REVIEW_AUTO_HELP_MARKDOWN = `
## Ajuda — /review-auto

Orquestra transições de revisão com confirmação explícita.

### Uso

- \`/review-auto\` (propor Gate 2 -> Gate 3 / status review)
- \`/review-auto --confirm <codigo>\` (confirmar proposta pendente)
- \`/review-auto --approved\` (propor Gate 3 -> Gate 4 / ready-to-commit)
- \`/review-auto --approved --confirm <codigo>\` (confirmar aprovação proposta)
- \`/review-auto --changes-requested\` (propor retorno para Gate 2 / in-progress)
- \`/review-auto --changes-requested --confirm <codigo>\` (confirmar retrabalho proposto)
- \`/review-auto --batch-consent\` (propor consentimento da sessão para \`--auto\`)
- \`/review-auto --batch-consent --confirm <codigo>\` (confirmar consentimento)
- \`/review-auto --approved --auto\` (aplicar sem proposta quando consentimento batch existir)
- \`/review-auto --changes-requested --auto\` (idem para retorno de retrabalho)
`;

router.get('/help', (req: Request, res: Response) => {
  const topic = (req.query.topic as string | undefined)?.trim().toLowerCase();
  if (!topic) {
    res.json({ markdown: HELP_MARKDOWN });
    return;
  }
  if (topic === 'status' || topic === '/status') {
    res.json({ markdown: STATUS_HELP_MARKDOWN });
    return;
  }
  if (topic === 'agent' || topic === '/agent') {
    res.json({ markdown: AGENT_HELP_MARKDOWN });
    return;
  }
  if (topic === 'batch' || topic === '/batch') {
    res.json({ markdown: BATCH_HELP_MARKDOWN });
    return;
  }
  if (topic === 'review-auto' || topic === '/review-auto') {
    res.json({ markdown: REVIEW_AUTO_HELP_MARKDOWN });
    return;
  }
  res.json({
    markdown:
      `❓ Tópico de ajuda não encontrado: \`${topic}\`.\n\n` +
      '**Tópicos disponíveis:** status, agent, batch, review-auto\n\n' +
      'Use `/help` para ver o guia geral.',
  });
});

export default router;
