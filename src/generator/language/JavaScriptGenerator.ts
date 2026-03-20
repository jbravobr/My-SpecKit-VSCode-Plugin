export function generateJavaScript(): string {
  return `---
applyTo: "**/*.js,**/*.mjs"
---
# JavaScript ES2022+ — Boas Práticas

- Use ESM (import/export); nunca CommonJS (require/module.exports) em código novo
- \`const\` por padrão; \`let\` apenas quando necessário; nunca \`var\`
- Use optional chaining (\`?.\`) e nullish coalescing (\`??\`) sempre que aplicável
- Async/await sobre Promises encadeadas; use \`Promise.all\` para I/O paralelo
- Array methods (map, filter, reduce) sobre loops imperativos
- Destructuring em parâmetros de funções e retornos de módulos
- Top-level await em módulos quando apropriado
`;
}
