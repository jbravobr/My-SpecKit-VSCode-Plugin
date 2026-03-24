export function generateCrudPattern(language: string, _framework: string): string {
  const isJava = language === 'java';
  const isCsharp = language === 'csharp';

  return `---
applyTo: "**"
---
# CRUD — Boas Práticas

## Repository Pattern

- ${isJava ? '`JpaRepository<E, ID>` como interface base — nunca acesse o EntityManager diretamente na camada de serviço' : isCsharp ? '`DbSet<T>` via `DbContext` — nunca instancie o contexto fora do escopo de uma requisição/transação' : 'Interface de repositório na camada de domínio — implementação na camada de infraestrutura'}
- Custom queries via ${isJava ? '`@Query` com JPQL; nunca SQL nativo sem justificativa documentada' : isCsharp ? 'LINQ com expressões tipadas; nunca SQL raw sem justificativa' : 'métodos tipados — nunca strings SQL concatenadas'}
- Em arquitetura hexagonal: a **interface** do repositório pertence ao domínio; a **implementação** pertence ao adapter de infra
- Nunca chame repositório diretamente do controller — passe sempre pela camada de serviço/caso de uso

## Separação DTO ↔ Entidade

- **Nunca exponha a entidade de domínio diretamente na resposta da API** — crie DTOs de resposta específicos
- Padrão de nomes: \`CreateXxxRequest\`, \`UpdateXxxRequest\`, \`XxxResponse\` por recurso
- Mapeamento via ${isJava ? '**MapStruct** — configure o mapper uma vez; nunca mapeie campo a campo inline no controller/service' : isCsharp ? '**AutoMapper** — configure profiles no startup; nunca mapeie inline no controller' : 'função de mapeamento explícita — nunca misture lógica de mapeamento com lógica de negócio'}
- Campos sensíveis (senhas, tokens internos) **nunca** aparecem nos DTOs de resposta

## Paginação

- **Todos os endpoints de listagem são paginados** — nunca retorne lista sem paginação de banco de dados
- ${isJava ? 'Spring: parâmetro `Pageable` nos métodos do repositório; retorne `Page<XxxResponse>` no controller' : isCsharp ? 'Receba `int page` e `int pageSize` no request; aplique `.Skip((page-1) * pageSize).Take(pageSize)` na query' : 'Receba `page` e `pageSize`; aplique offset e limit na query'}
- Aplique **tamanho máximo de página**: rejeite requests com \`pageSize > 100\` (ou limite do domínio)
- Inclua na resposta: \`totalElements\`, \`totalPages\`, \`page\`, \`pageSize\`

## Specification / Filtro Dinâmico

- ${isJava ? 'Use `Specification<T>` (Spring Data JPA) para filtros dinâmicos compostos — cada critério = um predicado isolado' : isCsharp ? 'Componha filtros via `IQueryable<T>.Where()` extensions — cada critério = um método de extensão' : 'Componha filtros via funções puras — cada critério = uma função que retorna uma condição'}
- Nunca concatene condições em string SQL para montar filtros — use parâmetros tipados
- Filtros opcionais: verifique se o valor foi fornecido antes de aplicar o predicado

## Validação de Input

- ${isJava ? 'Bean Validation: `@NotNull`, `@NotBlank`, `@Size`, `@Valid` no parâmetro do controller — Spring lança `MethodArgumentNotValidException` automaticamente' : isCsharp ? 'FluentValidation: uma classe `XxxValidator` por command/request; registre validadores no DI container; valide no handler antes da lógica' : 'Valide na fronteira de entrada (controller/handler) — nunca na camada de domínio ou repositório'}
- **Valide na fronteira da API**, não na camada de serviço ou domínio
- Retorne erros de validação com detalhes por campo — não apenas "dados inválidos"

## Tratamento de Erros (RFC 7807)

- Padrão de resposta de erro: **RFC 7807 ProblemDetails** — shape consistente independente do tipo de erro
- ${isJava ? '`ProblemDetail.forStatusAndDetail(HttpStatus, String)` (Spring 6+) via `@ControllerAdvice`' : isCsharp ? '`ValidationProblem()` para erros de validação, `Problem()` para erros de negócio — helpers do `ControllerBase`' : 'Retorne `{ type, title, status, detail, instance }` em todos os erros'}
- Mapeie exceções de domínio para HTTP status semânticos: \`404\` (não encontrado), \`409\` (conflito/duplicata), \`422\` (regra de negócio violada), \`400\` (input inválido)
- Nunca vaze stack traces ou mensagens de exceção interna na resposta — logue internamente

## Idempotência em Mutations

- **POST de criação**: aceite ID gerado pelo cliente (UUID v4) como ID do recurso — previne duplicata em retry
- Alternativa: cabeçalho \`Idempotency-Key\` — armazene o resultado do primeiro request; retorne o mesmo resultado em retries com a mesma key
- Verifique existência antes de inserir: retorne \`200 OK\` com o recurso já existente (não \`409\`) quando a operação é naturalmente idempotente

## Campos de Auditoria

- Toda entidade mutável deve ter: \`createdAt\`, \`updatedAt\`, \`createdBy\`
- ${isJava ? '`@EntityListeners(AuditingEntityListener.class)` + `@EnableJpaAuditing` + `@CreatedDate` / `@LastModifiedDate` / `@CreatedBy`' : isCsharp ? 'Override de `SaveChanges()` e `SaveChangesAsync()` no `DbContext` para setar timestamps automaticamente' : 'Intercepte a camada de persistência para popular os campos antes de cada insert/update'}
- \`createdAt\` e \`updatedAt\` são em UTC; nunca use timezone local do servidor

## Soft Delete vs Hard Delete

- **Documente a decisão** no início do projeto — nunca misture as duas abordagens na mesma entidade
- Se soft delete: campo \`deletedAt TIMESTAMP NULL\`; aplique filtro global \`WHERE deleted_at IS NULL\` em todas as queries
- ${isJava ? 'Spring: `@Where(clause = "deleted_at IS NULL")` na entidade ou via Specification global' : isCsharp ? 'EF Core: `HasQueryFilter(e => e.DeletedAt == null)` no `OnModelCreating`' : 'Aplique filtro na camada de repositório — nunca deixe o caller responsável por filtrar deletados'}
- Hard delete: use apenas quando a remoção do dado tem significado permanente e auditável
`;
}
