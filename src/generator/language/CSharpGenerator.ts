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
- Toda operação de I/O deve ser async — sem bloqueio com .Result ou .Wait()
- Prefira **Primary constructors** em classes de serviço simples
- Injete dependências pelo construtor; configure no DI container
`;
}
