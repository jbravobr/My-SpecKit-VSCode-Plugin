export function generateArchitecture(): string {
  return `---
applyTo: "**"
---
# Architecture & Design — Obsessão com Estrutura

## Princípios universais
- Respeite rigorosamente a arquitetura definida na story (hexagonal, layered, etc.)
- Aplique SOLID: cada classe tem uma responsabilidade; dependa de abstrações
- Prefira composição a herança
- Separe sempre: I/O, lógica de domínio e infraestrutura

## Hexagonal (quando definido na story)
- Domínio: zero imports de framework ou infraestrutura
- Ports: interfaces definidas pelo domínio, não pelo adapter
- Adapters: implementam ports (HTTP, banco, mensageria, CLI)
- Application Services: orquestram casos de uso via ports

## Antes de propor qualquer estrutura de código
- Identifique a camada arquitetural em que o código pertence
- Verifique se a proposta viola a direção de dependências da arquitetura definida
- Justifique explicitamente desvios — nenhum desvio silencioso é aceitável
`;
}
