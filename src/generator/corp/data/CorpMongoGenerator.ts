export function generateCorpMongo(): string {
  return `---
name: corp-mongo
description: "Corp padrões para MongoDB (pool de conexão, índices, modelagem de documento, tratamento de exceções). Use quando trabalhar em qualquer projeto MongoDB independente do driver (nativo, Mongoose, Motor, Mongo.Driver, Spring Data)."
---
# Corp · MongoDB

## Conexão e Pool
- Use **uma única instância** do client por aplicação (singleton) — drivers gerenciam pool interno.
- Configure \`maxPoolSize\`, \`minPoolSize\`, \`maxIdleTimeMS\` explicitamente — não confie no default em produção.
- Habilite \`retryWrites=true\` e \`retryReads=true\` na connection string.
- Use \`readPreference\` adequado (\`primary\` para escrita, \`secondaryPreferred\` para leituras tolerantes a lag).

## Modelagem
- Embedding para dados 1–N pequenos e que se leem juntos; reference para N–N ou grandes.
- Evite documentos > 16 MB. Atenção ao crescimento ilimitado de arrays.
- Schema com validação (\`$jsonSchema\` ou validação na aplicação) — Mongo sem schema não é Mongo sem contrato.

## Índices
- Crie índices **explicitamente** (não apenas via convenção do ODM).
- Compostos respeitam **ESR**: Equality → Sort → Range.
- Monitore \`$indexStats\` e remova índices não usados.
- TTL indexes para dados com expiração natural.

## Queries
- **Projete** os campos necessários (\`projection: { campo: 1 }\`) — não busque o documento inteiro.
- Use \`explain("executionStats")\` para validar uso de índice em queries críticas.
- Bulk operations (\`bulkWrite\`) para múltiplas escritas — não loop de \`updateOne\`.

## Exceções e Resiliência
- Distinga: \`DuplicateKeyException\` (E11000), \`WriteConflictException\`, \`MongoNetworkException\`, \`MongoTimeoutException\`.
- Idempotência via chave de negócio + índice único — não dependa só de \`upsert\`.
- Transações multi-documento apenas quando estritamente necessário (custo alto).
`;
}
