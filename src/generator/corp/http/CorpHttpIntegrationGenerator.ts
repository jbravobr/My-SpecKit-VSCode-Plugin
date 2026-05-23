export function generateCorpHttpIntegration(): string {
  return `---
name: corp-http-integration
description: "Corp padrões para integrações HTTP (Gateway pattern, retry + circuit breaker, timeouts, correlation-id). Use quando consumir APIs externas via qualquer cliente HTTP em qualquer linguagem."
---
# Corp · HTTP Integration (Universal)

## Gateway Pattern
- Toda integração HTTP fica encapsulada em uma classe \`<Sistema>Gateway\` (ou \`<Sistema>Client\`).
- O gateway expõe métodos do domínio (\`buscarCliente(id)\`), não verbos HTTP.
- Mapeia respostas de erro para **exceções do domínio**, nunca propaga \`HttpStatusException\` para a camada de negócio.

## Timeouts Obrigatórios
- \`connectTimeout\`, \`readTimeout\`, \`writeTimeout\` configurados explicitamente — nunca defaults infinitos.
- Valores tipicamente: connect 2–5s, read 5–30s conforme SLA do upstream.
- Timeout total do request menor que o timeout da chamada que origina.

## Retry + Circuit Breaker
- Use lib de resiliência apropriada à stack:
  - Java: **Resilience4j** (\`@Retry\` + \`@CircuitBreaker\`).
  - .NET: **Polly** (\`AddPolicyHandler\` no \`HttpClientFactory\`).
  - Node: \`opossum\` + \`p-retry\` ou \`axios-retry\`.
  - Python: \`tenacity\` + \`pybreaker\`.
- Retry **apenas para idempotentes** (GET, PUT, DELETE) e erros transientes (5xx, timeout, connection reset).
- Backoff exponencial com jitter. Máximo 3 tentativas.
- Circuit breaker com \`failureRateThreshold\` e \`waitDurationInOpenState\` calibrados.

## Correlation ID / Tracing
- Propague \`traceparent\` (W3C) recebido. Se ausente, gere.
- Adicione header \`X-Correlation-Id\` em **todas** as chamadas saintes.
- Logue request/response (sem body sensível) com \`correlation-id\` no MDC.

## Erros
- 4xx → exceção de domínio (não retry).
- 5xx / timeout → retry + circuit breaker.
- Status inesperado → log de warning + exceção genérica.

## Segurança
- Token/credencial buscado de fonte segura (Secrets Manager) com cache.
- Nunca logue \`Authorization\` header.
- TLS verificado (sem \`verify=false\` / \`trustAll\`).
`;
}
