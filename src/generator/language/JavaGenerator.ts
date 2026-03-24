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
- Java 21: text blocks (\`"""..."""\`) para SQL, JSON e mensagens multiline
- Java 21: virtual threads (\`Executors.newVirtualThreadPerTaskExecutor()\`) para serviços com I/O intenso — não usar para CPU-bound
- \`@Value\` (Lombok) para objetos de domínio imutáveis quando Records não são adequados (ex.: estágios de builder mutáveis)
- Exceções checadas vs não-checadas: use unchecked (\`RuntimeException\`) para erros de domínio; lance tipos específicos; nunca lance \`Exception\` diretamente
`;
}
