export function generateIdempotency(): string {
  return `---
applyTo: "**"
---
# Idempotência — APIs REST e Operações de Escrita

## PUT — naturalmente idempotente

- PUT **substitui** o recurso inteiro — executar duas vezes com o mesmo body deve produzir o mesmo estado
- Nunca use PUT para operações parciais (use PATCH para atualizações parciais)
- Resposta esperada: \`200 OK\` com o recurso atualizado, ou \`204 No Content\`
- Se o recurso não existir e a semântica de negócio permitir criação: \`201 Created\`

## POST — requer Idempotency-Key para operações não idempotentes

- Operações de criação ou processamento acionadas por POST **devem** suportar o header \`Idempotency-Key\`
- O cliente gera uma chave única (UUID v4) por tentativa lógica e a reusa em retentativas
- O servidor armazena o resultado da primeira execução (TTL ≥ 24h) e retorna o mesmo resultado em chamadas subsequentes com a mesma chave
- Resposta na primeira chamada: \`201 Created\` ou \`202 Accepted\`
- Resposta em chamada repetida com a mesma chave: \`200 OK\` com o resultado original (nunca processe novamente)
- Resposta quando a chave está em processamento: \`409 Conflict\` com \`Retry-After\` header

## Deduplicação por chave de negócio

- Antes de persistir qualquer entidade, verifique unicidade por chave de negócio (ex.: \`orderId\`, \`transactionId\`, \`correlationId\`)
- Use \`INSERT ... ON CONFLICT DO NOTHING\` (PostgreSQL) ou \`putItem\` com \`ConditionExpression: "attribute_not_exists(pk)"\` (DynamoDB)
- Em Kafka: deduplicar por \`(messageKey, offset)\` ou por business ID antes de persistir — consumidor é at-least-once por padrão
- Resultado: entidade já existe → retorne o registro existente, não lance erro 500

## Respostas corretas por cenário

| Cenário | Status HTTP |
|---|---|
| Criação bem-sucedida (primeira vez) | \`201 Created\` |
| Idempotency-Key já processada com sucesso | \`200 OK\` |
| Idempotency-Key em processamento | \`409 Conflict\` + \`Retry-After\` |
| Recurso já existe (sem Idempotency-Key) | \`409 Conflict\` com campo conflitante |
| PUT em recurso inexistente (criação permitida) | \`201 Created\` |
| PUT em recurso inexistente (criação não permitida) | \`404 Not Found\` |

## Armazenamento de resultado idempotente

- Armazene: chave, status (\`processing\`/\`done\`/\`failed\`), resultado serializado, timestamp de expiração
- Redis com TTL é a implementação mais comum: \`SET idempotency:{key} {result} EX 86400 NX\`
- DynamoDB com TTL attribute: \`ttl = now + 86400\`
- Nunca armazene o resultado em memória de processo — não sobrevive a reinicializações

## O que NÃO fazer

- Nunca permita que POST crie duplicatas silenciosamente — cliente não sabe se deve retentar
- Nunca retorne \`500\` em operação duplicada — é problema de design, não erro de servidor
- Nunca diferencie criação de idempotência pelo ID — use Idempotency-Key explicitamente
- Nunca processe novamente uma operação cujo resultado já foi confirmado ao cliente
`;
}
