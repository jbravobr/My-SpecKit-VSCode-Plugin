export function generateCorpKafka(): string {
  return `---
name: corp-kafka
description: "Corp padrões universais Kafka (at-least-once, idempotência, DLT, semântica de offset). Use quando implementar qualquer producer/consumer Kafka independente da linguagem."
---
# Corp · Kafka (Multi-stack)

## Semântica de Entrega
- Padrão: **at-least-once**. Consumer deve ser idempotente.
- Exactly-once só com \`enable.idempotence=true\` + transações e custo de throughput aceito explicitamente.
- \`acks=all\` em producers de dados críticos.

## Idempotência (Consumer)
- Use chave de negócio + tabela inbox / cache para deduplicar.
- Não confie em \`offset\` como deduplicador — rebalances reentregam.

## Offset Management
- \`enable.auto.commit=false\`. Commit **manual** após processamento bem-sucedido.
- Commit em batch quando possível (\`commitSync\` ao fim do poll).
- Em erros não-recuperáveis: publique na DLT e commit (não bloqueie a partition).

## Dead Letter Topic (DLT)
- Padrão de nomenclatura: \`<topic>.dlt\` ou \`<topic>.<consumer-group>.dlt\`.
- Headers preservam: causa, stack trace resumida, contagem de retries, timestamp original.
- DLT tem processo de reprocessamento controlado.

## Retry
- Retries **assíncronos** em tópicos de retry (\`<topic>.retry-1\`, \`<topic>.retry-2\`) com backoff crescente.
- Não use \`retry.backoff.ms\` para retries de aplicação — bloqueia a partition.

## Partições e Ordem
- Ordem garantida **apenas dentro de uma partition**. Use chave de particionamento consistente com a unidade de ordem (ex.: \`accountId\`).
- Número de partitions ≥ paralelismo desejado de consumer; aumentar partitions é simples, reduzir é caro.

## Headers
- Inclua \`correlation-id\`, \`traceparent\` (W3C), \`source-service\`, \`schema-version\` em todos os eventos.

## Schema
- Use **schema registry** (Avro/Protobuf/JSON Schema). Evolução compatível para frente/trás.
- Nunca publique JSON livre em tópico de domínio.
`;
}
