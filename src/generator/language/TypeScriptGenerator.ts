export function generateTypeScript(): string {
  return `---
applyTo: "**/*.ts,**/*.tsx"
---
# TypeScript — Boas Práticas

- \`"strict": true\` sempre habilitado no tsconfig.json
- Prefira \`interface\` para contratos públicos; \`type\` para unions e composições
- Use **branded types** para identificadores de domínio: \`type UserId = string & { _brand: 'UserId' }\`
- Use **discriminated unions** em vez de enums
- Use **Zod** para validação em runtime nas fronteiras (API input, env vars)
- Use o operador \`satisfies\` para configurações tipadas
- Evite \`any\`; prefira \`unknown\` com type guards explícitos
- Async/await sempre; sem .then()/.catch() encadeados
- Habilite \`noUncheckedIndexedAccess\` para acesso seguro a arrays
`;
}
