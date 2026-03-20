export function generateDotNet(): string {
  return `---
applyTo: "**/*.cs"
---
# ASP.NET Core — Boas Práticas

## DI e Arquitetura
- Constructor injection para todos os serviços
- Registre interfaces no DI container — nunca instancie serviços com \`new\`
- Aplique Clean Architecture: Domain → Application → Infrastructure → API

## Async e Performance
- Todo endpoint e operação de I/O deve ser async Task<T>
- Nunca use \`.Result\` ou \`.Wait()\` — causa deadlock em ASP.NET
- Projete queries: nunca \`SELECT *\`; use apenas os campos necessários

## Configuração e Resiliência
- Configure com \`IOptions<T>\` — sem acesso direto a \`IConfiguration\` em serviços
- Valide configurações com \`[Required]\` e \`ValidateOnStart()\`
- Use \`ILogger<T>\` para logging estruturado — nunca \`Console.WriteLine\`
- Trate erros globalmente com middleware; nunca swallow exceptions
`;
}
