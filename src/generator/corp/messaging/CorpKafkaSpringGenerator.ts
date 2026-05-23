export function generateCorpKafkaSpring(): string {
  return `---
name: corp-kafka-spring
description: "Corp padrões Spring Kafka (@RetryableTopic, ConcurrentKafkaListenerContainerFactory, SASL JAAS programático). Use quando implementar Kafka em projetos Java/Spring."
applyTo: "**/*.java"
---
# Corp · Kafka em Spring (Java)

## @RetryableTopic
- Use \`@RetryableTopic\` para padrão de retry topics gerenciado pelo framework.
- Configure \`attempts\`, \`backoff\` (\`@Backoff\`), \`dltStrategy=FAIL_ON_ERROR\` e \`autoCreateTopics=false\` (topologia controlada).
- DLT handler com \`@DltHandler\` no mesmo bean — não deixe DLT silencioso.

## Container Factory
- Configure \`ConcurrentKafkaListenerContainerFactory\` **explicitamente** como \`@Bean\` — não confie em auto-config do Boot.
- \`AckMode.MANUAL_IMMEDIATE\` para controle preciso.
- \`concurrency\` ≤ número de partitions do tópico.
- \`CommonErrorHandler\` customizado para classificar exceções (retry vs DLT).

## ConsumerFactory / ProducerFactory
- Beans explícitos com \`Map<String,Object>\` de propriedades — sem espalhar config em \`application.yml\` apenas.
- Serializadores tipados (Avro/Protobuf) — não \`StringDeserializer\` para payloads de domínio.

## SASL / mTLS programático
- Em ambientes onde o secret vem rotacionado (ex.: AWS MSK + IAM, ou SASL/SCRAM com Secrets Manager): construa \`sasl.jaas.config\` **programaticamente** no bean factory após buscar o secret — nunca string fixa.
- Mantenha o \`KafkaAdmin\` e clients no mesmo ciclo de credencial.

## @KafkaListener
- \`groupId\` explícito por consumer; nunca random.
- \`containerFactory\` apontando para o factory bean nomeado.
- Aceite \`Acknowledgment ack\` no método e chame \`ack.acknowledge()\` ao fim do processamento bem-sucedido.

## Observabilidade
- Micrometer já integrado — exponha \`kafka.consumer.records-lag-max\` em alertas.
- MDC populado com \`topic\`/\`partition\`/\`offset\`/\`key\` no listener.
`;
}
