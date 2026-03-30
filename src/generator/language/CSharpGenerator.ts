export function generateCSharp(): string {
  return `---
applyTo: "**/*.cs"
---
# C# .NET 8+ — Boas Práticas

- Habilite \`<Nullable>enable</Nullable>\` em todos os projetos
- Use **Records** para DTOs e objetos de valor imutáveis
- Use **Pattern matching** para null checks e type checks — evite casting direto
- Use **LINQ** com operadores async (FirstOrDefaultAsync, etc.) — evite foreach com acumulador
- **Init-only properties** para imutabilidade sem records
- C# 11: propriedades **\`required\`** — o compilador exige inicialização no object initializer, eliminando a necessidade de construtor para DTOs (\`public required string Name { get; init; }\`)
- C# 12: **collection expressions** — use \`[item1, item2]\` em vez de \`new List<T> { item1, item2 }\` para inicialização de coleções
- Toda operação de I/O deve ser async — sem bloqueio com .Result ou .Wait()
- Prefira **Primary constructors** em classes de serviço simples
- .NET 8: use **\`TimeProvider\`** em vez de \`DateTime.Now\`/\`DateTimeOffset.UtcNow\` — injetável, testável com \`FakeTimeProvider\` nos testes
- Injete dependências pelo construtor; configure no DI container
`;
}
