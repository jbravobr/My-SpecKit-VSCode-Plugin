export function generateCorpDataAccess(): string {
  return `---
name: corp-data-access
description: "Corp padrões universais de acesso a dados (auditoria created/updated, prevenção de N+1, fetch graphs, optimistic locking). Use quando implementar repositórios, queries ou camadas de persistência em qualquer ORM/data access."
---
# Corp · Data Access (Universal)

## Auditoria
- Toda entidade persistente tem: \`createdAt\`, \`createdBy\`, \`updatedAt\`, \`updatedBy\`.
- Populados automaticamente via interceptor/listener do ORM (\`@PrePersist\`/\`@PreUpdate\` em JPA, hooks em Mongoose, etc.) — nunca manualmente em cada save.
- Timestamps em UTC; \`*By\` vem do contexto de segurança (subject do token).

## Prevenção de N+1
- Identifique N+1 cedo: log de SQL em dev/test + assert em testes de integração no número de queries.
- Use **fetch graphs / eager batch / join fetch** explícitos para o caso de uso — não \`FetchType.EAGER\` global.
- Em Spring Data: \`@EntityGraph(attributePaths={...})\` por método de repositório.
- Em SQLAlchemy: \`selectinload\` / \`joinedload\` conforme cardinalidade.

## Optimistic Locking
- Toda entidade mutável tem campo \`version\` (\`@Version\` em JPA, equivalente em outros ORMs).
- Em conflito (\`OptimisticLockException\` / \`StaleObjectStateException\`): retorne 409 Conflict ao cliente com instrução de retry.
- Evite pessimistic locking exceto em hot-spots comprovados.

## Paginação obrigatória
- Toda query que retorna coleção tem **paginação obrigatória** com limite máximo configurável (ex.: 100).
- Cursor-based para datasets grandes / sincronização; offset para UI tradicional.

## Transações
- Granularidade no caso de uso (não no repositório).
- Read-only marcado explicitamente (\`@Transactional(readOnly=true)\`).
- Não chame serviços externos (HTTP/queue) dentro de transação aberta — riscos de timeout e inconsistência.
`;
}
