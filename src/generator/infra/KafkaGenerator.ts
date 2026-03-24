export function generateKafka(): string {
  return `---
applyTo: "**"
---
# Kafka — Boas Práticas

## Consumer

- Configure um **consumer group** por aplicação/serviço — nunca compartilhe grupos entre serviços distintos
- Semântica **at-least-once**: assuma que mensagens podem ser entregues mais de uma vez — projete para idempotência
- **Idempotência no consumer**: deduplique pelo business ID (ex.: \`pedidoId\`) ou pelo par \`(partition, offset)\` antes de processar, não depois
- Trate \`SerializationException\` explicitamente — nunca deixe um erro de desserialização parar a partição; encaminhe para DLQ com cabeçalho de causa
- **Graceful shutdown**: trate SIGTERM / \`@PreDestroy\` para finalizar a mensagem em andamento antes de encerrar; nunca interrompa o processamento no meio

## Producer

- Configure \`acks=all\` — confirmação de escrita em todos os réplicas do líder antes de considerar entrega confirmada
- Habilite **idempotent producer**: \`enable.idempotence=true\` (Spring) / \`'enable.idempotence': True\` (Python) — garante exatamente uma escrita mesmo em retry de rede
- **Key selection**: use a chave de negócio que define particionamento (ex.: \`customerId\`, \`pedidoId\`) — mensagens com a mesma key sempre chegam na mesma partição e em ordem
- **Convenção de nomes de tópico**: \`<dominio>.<entidade>.<evento>.v<N>\` — ex.: \`pagamentos.pedido.criado.v1\`; versione tópicos, não altere schema sem versão nova

## DLQ — Dead Letter Queue

- Crie um tópico DLT dedicado por consumer: \`<topico-original>.DLT\`
- Ao enviar para DLT, inclua headers: \`kafka_dlt-original-topic\`, \`kafka_dlt-original-partition\`, \`kafka_dlt-original-offset\`, \`kafka_dlt-exception-fqcn\`, \`kafka_dlt-exception-message\`
- Nunca descarte mensagens silenciosamente — se não for para DLQ, ao menos logue com nível ERROR incluindo todos os headers acima
- A DLT deve ter um consumer de monitoramento/reprocessamento separado

## Retry & Backoff

- Separe erros **retryáveis** (falha transitória de infra: timeout, conexão recusada) de **não-retryáveis** (falha de desserialização, violação de regra de negócio) — não-retryáveis vão direto à DLQ sem retry
- Exponential backoff com jitter: evite thundering herd; nunca retry linear em intervalos fixos
- Máximo de tentativas recomendado: 3 (ajuste conforme SLA da operação)
- **Spring**: use \`@RetryableTopic(attempts = 3, backoff = @Backoff(delay = 1000, multiplier = 2))\` com DLT automático
- **Python / JS**: implemente loop de retry com \`asyncio.sleep(backoff)\` / \`setTimeout\`; capture a exceção e decida se reencaminha ou descarta antes do próximo ciclo

## Schema Registry (opcional)

- **Confluent Schema Registry** com Avro ou Protobuf é recomendado para projetos com múltiplos producers/consumers ou evolução de schema frequente
- Quando usado: registre o schema no producer no primeiro envio; valide no consumer antes de desserializar
- Permite evolução compatível (adição de campos com default) sem coordenação manual entre times
- Não é obrigatório para projetos simples com schema estável e um único producer/consumer
`;
}
