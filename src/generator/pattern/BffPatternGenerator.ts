export function generateBffPattern(): string {
  return `---
applyTo: "**"
---
# BFF — Backend for Frontend

## Responsabilidade

- O BFF é uma **camada de orquestração fina** — sem lógica de negócio; sem regras de domínio
- Responsabilidades válidas: agregar chamadas a downstream, transformar respostas para o contrato do cliente, relay de autenticação
- Se você está implementando uma regra de negócio no BFF, mova-a para o serviço de domínio adequado

## Agregação de APIs

- Fan-out para múltiplos backends **em paralelo**: \`CompletableFuture.allOf()\` (Java) / \`Task.WhenAll()\` (.NET)
- Combine, filtre e remodele a resposta para o contrato que o frontend precisa — o cliente não deve conhecer a estrutura interna dos serviços
- Nunca faça chamadas sequenciais quando as respostas são independentes entre si

## Auth & Token Relay

- Receba o token do cliente, valide a assinatura, e encaminhe como header \`Authorization: Bearer <token>\` para os serviços downstream
- Alternativa: troque o token do cliente por um token de serviço-a-serviço na fronteira do BFF (client credential grant)
- **Nunca exponha tokens internos de serviço ao cliente** — o cliente só deve ver o token que ele mesmo emitiu ou que o BFF emitiu para ele
- Gerencie a sessão do cliente no BFF (cookie httpOnly) quando o frontend não deve lidar com tokens diretamente

## Timeout & Circuit Breaker

- Defina **timeout explícito** em cada chamada downstream (recomendado: 3s; ajuste por SLA do serviço)
- **Circuit breaker** (Resilience4j / Polly) em cada integração downstream — falhe rápido quando o serviço está indisponível
- Prefira **resposta parcial com dados degradados** a falha total — retorne o que você conseguiu; sinalize o que está indisponível
- Não propague timeouts raw do downstream — mapeie para \`503 Service Unavailable\` com \`Retry-After\` header

## Normalização de Erros

- **Capture todos os erros downstream** — o frontend nunca deve ver shapes de erro dos serviços internos
- Mapeie para **RFC 7807 ProblemDetails** antes de responder ao cliente
- Inclua \`traceId\` no ProblemDetail para correlação com logs internos
- Erros de autenticação/autorização: sempre \`401\`/\`403\` — nunca vaze detalhes do motivo ao cliente não autenticado

## Stateless

- O BFF é **stateless** — nenhum estado em memória que diverge entre instâncias
- Estado do usuário vive nos serviços downstream ou na sessão do cliente (cookie/token)
- Não use caches in-process que não são replicados entre instâncias — use Redis se precisar de cache compartilhado

## Contract Testing

- Veja \`instructions/pattern-contract-testing.instructions.md\` para guidance completo de WireMock e Pact
- Gate 2 para stories de BFF exige WireMock stubs para cada downstream service integrado
- Cenários obrigatórios: happy path, 404 downstream, 500 downstream, timeout > threshold
`;
}
