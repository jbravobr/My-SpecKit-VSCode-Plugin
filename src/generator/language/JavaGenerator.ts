export function generateJava(): string {
  return `---
applyTo: "**/*.java"
---
# Java 17+ — Boas Práticas

- Use **Records** para DTOs, value objects e dados imutáveis
- Use **Sealed classes** para modelar variantes de domínio (ADTs)
- Use **Pattern matching** em switch expressions para exaustividade
- Use **Optional** em vez de retornar null — nunca passe Optional como parâmetro
- Use **Stream API** para transformações de coleções; evite for-each com acumulador
- **Constructor injection** sempre (nunca field injection com @Autowired)
- Prefira \`var\` para inferência local onde o tipo é óbvio no contexto
- Use \`@NotNull\`/\`@Nullable\` nas assinaturas públicas
`;
}
