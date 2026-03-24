export function generateArchitecture(): string {
  return `---
applyTo: "**"
---
# Architecture & Design — Obsessão com Estrutura

## Princípios universais
- Respeite rigorosamente a arquitetura definida na story (hexagonal, layered, etc.)
- Aplique SOLID: cada classe tem uma responsabilidade; dependa de abstrações
- Prefira composição a herança
- Separe sempre: I/O, lógica de domínio e infraestrutura

## Hexagonal (quando definido na story)
- Domínio: zero imports de framework ou infraestrutura
- Ports: interfaces definidas pelo domínio, não pelo adapter
- Adapters: implementam ports (HTTP, banco, mensageria, CLI)
- Application Services: orquestram casos de uso via ports

## Clientes HTTP — resiliência obrigatória

Todo código que realiza chamadas HTTP de saída (APIs externas, serviços internos, OAuth2, webhooks) deve seguir:

- **Timeout explícito por cliente**: nunca use timeout default ou infinito. Defina connection timeout (≤3s) e read timeout (≤10s, ou conforme SLA do downstream)
- **Retry com backoff exponencial**: apenas para erros transitórios (5xx, timeout de rede, connection refused). Máximo 3 tentativas com jitter. **Nunca** faça retry em 4xx (não é erro transitório)
- **Não propague erro bruto do downstream**: mapeie para exceções de domínio ou códigos HTTP semânticos antes de expor ao chamador
- **Propague traceId**: inclua \`traceparent\` (W3C) ou \`X-Trace-Id\` em toda chamada de saída — o downstream precisa do contexto para correlação
- **Circuit Breaker** (quando o downstream é crítico para o fluxo principal): use Resilience4j (Java), Polly (.NET) ou equivalente. Configure: threshold de abertura, half-open probe interval, fallback explícito

### Configuração de referência por stack
- **Java/Spring**: \`RestClient\` ou \`WebClient\` com \`timeout(Duration.ofSeconds(5))\`; Resilience4j \`@CircuitBreaker\` + \`@Retry\`
- **TypeScript**: \`axios\` com \`timeout: 5000\`; retry via \`axios-retry\` com \`retryCondition: isNetworkOrIdempotentRequestError\`
- **Python**: \`httpx\` com \`timeout=httpx.Timeout(5.0)\`; retry via \`tenacity\` com \`wait_exponential\`
- **.NET**: \`HttpClient\` com \`Timeout\`; Polly \`ResiliencePipelineBuilder\` com \`AddRetry\` + \`AddCircuitBreaker\`

## Antes de propor qualquer estrutura de código
- Identifique a camada arquitetural em que o código pertence
- Verifique se a proposta viola a direção de dependências da arquitetura definida
- Justifique explicitamente desvios — nenhum desvio silencioso é aceitável
`;
}
