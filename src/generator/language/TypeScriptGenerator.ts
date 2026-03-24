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

## Tipos Avançados
- Utility types: \`Partial<T>\`, \`Required<T>\`, \`Pick<T, K>\`, \`Omit<T, K>\`, \`Record<K, V>\`, \`ReturnType<F>\`
- Type guards: use predicado \`is\` (\`function isUser(x: unknown): x is User\`) para narrowing seguro
- \`const\` assertions (\`as const\`) para objetos de configuração literais
- Generics: sempre constrainja com \`extends\` — nunca \`<T>\` sem restrição em APIs públicas
- \`satisfies\` operator para validar literais sem perder tipo concreto

## Qualidade
- Nunca use \`@ts-ignore\` — prefira \`@ts-expect-error\` com comentário explicativo
- \`eslint-plugin-@typescript-eslint\`: regras \`no-explicit-any\`, \`no-unsafe-*\` habilitadas
- Prefira \`readonly\` em propriedades de interfaces que não devem ser mutadas
`;
}
