export function generateContainerRuntimePreflightSection(): string {
  return `
## Pré-flight para Testcontainers (Docker ou Podman)

Antes de executar qualquer teste que dependa de containers locais (Testcontainers, LocalStack, Kafka/PostgreSQL em container ou Compose):

1. Execute \`docker info\`.
   - Se passar, use Docker como runtime e execute os testes.
2. Se Docker não existir ou não estiver rodando, execute \`podman --version\`.
   - Se Podman não existir, bloqueie a execução e informe a dependência ausente.
3. Se Podman existir, execute \`podman info\`.
   - Se falhar porque a máquina Podman está parada, execute \`podman machine start\` e repita \`podman info\`.
4. Execute os testes na mesma sessão de terminal usada para validar o runtime de containers.
5. Se Testcontainers ainda não conectar ao Podman, obtenha a conexão com \`podman system connection list\` ou \`podman machine inspect\`, configure o ambiente do processo de teste conforme a stack e registre a evidência.

Nunca marque testes de integração como "não aplicável" apenas porque Docker não está disponível quando Podman está instalado e pode ser iniciado.
`;
}
