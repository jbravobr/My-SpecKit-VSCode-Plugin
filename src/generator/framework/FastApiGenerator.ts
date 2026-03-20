export function generateFastApi(): string {
  return `---
applyTo: "**/*.py"
---
# FastAPI — Boas Práticas

## Estrutura e roteamento
- Organize rotas em \`APIRouter\` por domínio — nunca tudo no \`main.py\`
- Prefixe routers com a versão da API: \`/api/v1/<recurso>\`
- Separe camadas: routers (HTTP) → services (lógica) → repositories (dados)
- \`main.py\` apenas inicializa a app e inclui os routers

## Modelos e validação
- Use **Pydantic v2** para todos os schemas de request e response
- Schemas separados por intenção: \`CreateRequest\`, \`UpdateRequest\`, \`Response\`
- Nunca exponha modelos ORM diretamente — sempre mapeie para um schema Pydantic
- Use \`model_config = ConfigDict(from_attributes=True)\` para compatibilidade com ORMs

## Async e performance
- Endpoints com I/O (banco, HTTP externo) devem ser \`async def\`
- Use \`asyncio.gather()\` para operações de I/O paralelas
- Nunca chame código síncrono bloqueante dentro de \`async def\` — use \`run_in_executor\`
- Conexões de banco via pool assíncrono (SQLAlchemy async ou asyncpg)

## Injeção de dependência
- Use \`Depends()\` para serviços, sessões de banco e autenticação
- Nunca instancie serviços dentro do handler — injete via \`Depends\`
- Sessões de banco como dependency com \`yield\` para garantir fechamento

## Erros e respostas
- Use \`HTTPException\` com status codes semânticos para erros esperados
- Registre exception handlers globais com \`@app.exception_handler\`
- Nunca retorne \`200\` com payload de erro — use o status code correto
- Documente responses com \`responses={404: {...}}\` no decorator do endpoint
`;
}
