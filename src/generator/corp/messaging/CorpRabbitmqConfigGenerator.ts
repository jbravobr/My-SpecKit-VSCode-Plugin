export function generateCorpRabbitmqConfig(): string {
  return `---
name: corp-rabbitmq-config
description: "Corp padrões para configuração de exchanges/queues/bindings, publisher confirms, mandatory flag e prefetch em RabbitMQ/AMQP. Use quando configurar producers ou topologia AMQP em qualquer stack."
---
# Corp · RabbitMQ Topology & Producer Config

## Topologia
- Exchanges, queues e bindings **declarados em código** (idempotente) — nunca apenas no UI do broker.
- \`durable=true\` em exchanges/queues que carregam estado de negócio.
- Mensagens persistentes (\`delivery_mode=2\`) para dados que não podem ser perdidos.

## Nomenclatura
- Exchange: \`<dominio>.<evento>.exchange\` (ex.: \`pagamento.aprovado.exchange\`).
- Queue: \`<consumer>.<dominio>.<evento>.queue\`.
- Tipo padrão: \`topic\` (flexível) ou \`direct\` (1:1 estrito).

## Publisher Confirms
- Habilite **publisher confirms** (\`confirm.select\`).
- Producer trata callback de \`ack\`/\`nack\` — não considere "envio" completo até o ack do broker.
- Use publisher confirms **assíncronos** com agregação para alta throughput.

## Mandatory Flag
- \`mandatory=true\` para detectar mensagens não-roteadas (\`basic.return\`).
- Trate \`basic.return\` no producer — log + métrica + alerta.

## Prefetch (consumer side)
- Configurado por consumer, não no broker.
- Tipicamente 1–50; ajustar conforme tempo médio de processamento.

## Conexões e Canais
- **Uma conexão** TCP por aplicação; **um canal** por thread/consumer.
- Não compartilhe canal entre threads.
- Reconexão automática habilitada (todas as libs modernas suportam).

## Observabilidade
- Métricas: mensagens publicadas, ack/nack, returns, profundidade da fila, idade da mensagem mais antiga.
- Alerta em fila com profundidade crescente ou DLQ não-vazia.
`;
}
