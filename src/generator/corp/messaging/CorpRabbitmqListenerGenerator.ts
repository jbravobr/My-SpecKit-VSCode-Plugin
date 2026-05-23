export function generateCorpRabbitmqListener(): string {
  return `---
name: corp-rabbitmq-listener
description: "Corp padrões para consumidores RabbitMQ/AMQP (DLX, retry/backoff, requeue, idempotência). Use quando implementar qualquer consumidor AMQP (amqplib, pika, RabbitMQ.Client, Spring AMQP)."
---
# Corp · RabbitMQ Consumer Resilience

## Acknowledgement
- **Manual ack** (\`autoAck=false\`). \`basic.ack\` apenas após processamento bem-sucedido e commit de efeitos.
- \`basic.nack\` com \`requeue=false\` para erros não-recuperáveis → mensagem vai para DLX.
- \`basic.reject\` somente em mensagens malformadas.

## Dead Letter Exchange (DLX)
- Toda fila de trabalho tem DLX configurado (\`x-dead-letter-exchange\`).
- Padrão de nomenclatura: \`<queue>.dlx\` / \`<queue>.dlq\`.
- Mensagens em DLQ têm TTL e/ou processo de reinjeção controlada — DLQ não é lixo permanente.

## Retry com backoff
- Use **fila de retry** (exchange de delay com \`x-message-ttl\` crescente) — não \`requeue=true\` em loop (cria hot-loop).
- Estratégia comum: 3 tentativas com 5s → 30s → 5min, depois DLQ.
- Header \`x-death\` informa contagem de retries — leia para decidir DLQ vs nova tentativa.

## Idempotência
- Mensagem traz **ID de negócio** estável (não use \`messageId\` do broker como única referência).
- Consumer verifica processamento prévio (tabela de inbox / cache distribuído) antes de aplicar efeitos.

## Prefetch e concorrência
- \`channel.prefetch(N)\` para limitar mensagens não-acked por consumer — N proporcional à capacidade de processamento.
- Não use \`prefetch=0\` (ilimitado) em produção.

## Erros
- Exceções de domínio → DLQ direto.
- Exceções transientes (timeout de I/O, indisponibilidade) → fila de retry.
- Logue \`messageId\`, \`deliveryTag\`, \`routingKey\`, contagem de retries no MDC.
`;
}
