export function generatePython(): string {
  return `---
applyTo: "**/*.py"
---
# Python 3.11+ — Boas Práticas

- Type hints em todos os parâmetros e retornos — sem funções sem tipagem
- Use **Pydantic v2** para validação de dados externos (API, env, configs); use \`model_validator\` e \`computed_field\` em vez de \`@validator\` legado
- Use **dataclasses** com \`slots=True\` para estruturas internas de domínio
- Use \`pathlib.Path\` para qualquer operação de sistema de arquivos
- Use f-strings; evite concatenação de string e \`format()\`
- Async/await para I/O; \`asyncio.gather()\` para operações paralelas independentes
- Python 3.11+: **\`asyncio.TaskGroup\`** para concorrência estruturada — substitui \`asyncio.gather()\` quando falhas parciais precisam ser tratadas; cancela tasks pendentes automaticamente em caso de erro
- Python 3.11+: **\`ExceptionGroup\`** — trate exceções agrupadas de TaskGroup com \`except*\` em vez de capturar \`BaseException\`
- Prefira **match/case** (Python 3.10+) sobre if/elif em variantes de tipo
- Exponha contextos com \`contextlib.contextmanager\` ou \`asynccontextmanager\`

## Tooling
- Gerencie dependências com **\`uv\`** (\`uv add\`, \`uv sync\`) — substitui pip + virtualenv; mais rápido e determinístico que Poetry
- Formatação e linting com **\`ruff\`** (\`ruff format .\` e \`ruff check .\`) — substitui black + isort + flake8 em uma única ferramenta
- Type checking com **\`mypy\`** (\`--strict\`) ou **\`pyright\`**

## Configuração & Observabilidade
- \`pydantic-settings\`: configuração de ambiente tipada e validada — substitui leituras brutas de \`os.environ\`
- Hierarquia de exceções: \`DomainError\`, \`InfrastructureError\`, \`ValidationError\` — cada uma mapeia para um status HTTP distinto
- Structured logging: \`structlog\` (preferido) ou \`logging\` stdlib com JSON formatter; inclua \`request_id\` em cada registro de log
- pytest: \`@pytest.fixture\` para setup compartilhado, \`conftest.py\` para fixtures cross-module, \`pytest.mark.asyncio\` para testes async
`;
}
