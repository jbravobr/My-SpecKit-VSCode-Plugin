import { NonFunctionalSpec } from '../../story/Story';

export function generateObservability(nfr?: NonFunctionalSpec): string {
  const availability = nfr?.availability?.trim() || '99,9%';
  const performance = nfr?.performance?.trim() || 'P99 < 500ms';

  return `---
applyTo: "**"
---
# Observabilidade — Baseline Obrigatório

## Health Check

- Exponha endpoint \`/health\` (ou equivalente) em toda aplicação de servidor:
  - **Liveness**: retorna \`200\` se o processo está ativo — sem verificação de dependências externas
  - **Readiness**: retorna \`200\` se dependências críticas estão acessíveis (banco, cache, broker)
  - SpringBoot: Spring Actuator \`/actuator/health\`; FastAPI: endpoint \`/health\` manual; .NET: \`MapHealthChecks\`
- O health endpoint deve ser excluído de autenticação e configurado como alvo de liveness/readiness probe no orquestrador (ECS, Kubernetes)

## Logging Estruturado

- Todos os logs devem ser JSON estruturado — nunca strings concatenadas em produção
- Campos obrigatórios em toda linha de log: \`timestamp\` (ISO 8601 UTC), \`level\`, \`message\`, \`traceId\`, \`service\`
- \`traceId\` deve ser propagado de ponta a ponta:
  - Recebido via header \`traceparent\` (W3C) ou \`X-Trace-Id\`
  - Inserido no MDC / contexto do thread / structlog context vars
  - Retornado na resposta de erro como campo \`traceId\` no ProblemDetail
- Nunca logue: senhas, tokens, chaves, PII não auditável, payloads completos de request/response em produção

## Métricas

- Exponha métricas no formato Prometheus em \`/metrics\` — restrito à rede interna
- Métricas de negócio obrigatórias por endpoint: contador de requisições por resultado (success/error), histograma de latência
- Métricas de infraestrutura: conexões de pool (ativas/ociosas/max), erros de integração downstream, tamanho de filas
- **Kafka/SQS**: monitore \`consumer_lag\` por partition e por consumer group — lag crescente indica processador lento ou parado; alerte quando lag exceder threshold definido no SLO

## Rastreamento Distribuído (Tracing)

- Propague \`traceId\` em toda chamada entre serviços via headers HTTP padrão (\`traceparent\` W3C)
- Em mensageria (Kafka, SQS): inclua \`traceId\` nos headers da mensagem — o consumidor extrai e continua o trace
- Em jobs batch (GlueJob, scripts): gere \`traceId\` no início da execução e inclua em todos os logs da sessão
- Use OpenTelemetry SDK para instrumentação — evite instrumentação vendor-lock
- AWS Lambda: use Lambda Powertools para logging estruturado, tracing X-Ray e métricas em uma linha

## SLOs desta story

- **Disponibilidade**: ${availability}
- **Latência**: ${performance}
- Configure alertas para: error rate > 1%, latência P99 excedendo o threshold acima, health check falhando por > 30s
- Ative alerta de consumer lag quando aplicável (fila crescendo sem processamento)
`;
}
