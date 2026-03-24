export function generatePython(): string {
  return `---
applyTo: "**/*.py"
---
# Python 3.10+ — Boas Práticas

- Type hints em todos os parâmetros e retornos — sem funções sem tipagem
- Use **Pydantic** para validação de dados externos (API, env, configs)
- Use **dataclasses** com \`slots=True\` para estruturas internas de domínio
- Use \`pathlib.Path\` para qualquer operação de sistema de arquivos
- Use f-strings; evite concatenação de string e \`format()\`
- Async/await para I/O; \`asyncio.gather()\` para operações paralelas
- Prefira **match/case** (Python 3.10+) sobre if/elif em variantes de tipo
- Exponha contextos com \`contextlib.contextmanager\` ou \`asynccontextmanager\`

## Configuração & Observabilidade
- \`pydantic-settings\`: configuração de ambiente tipada e validada — substitui leituras brutas de \`os.environ\`
- Hierarquia de exceções: \`DomainError\`, \`InfrastructureError\`, \`ValidationError\` — cada uma mapeia para um status HTTP distinto
- Structured logging: \`structlog\` (preferido) ou \`logging\` stdlib com JSON formatter; inclua \`request_id\` em cada registro de log
- pytest: \`@pytest.fixture\` para setup compartilhado, \`conftest.py\` para fixtures cross-module, \`pytest.mark.asyncio\` para testes async
`;
}
