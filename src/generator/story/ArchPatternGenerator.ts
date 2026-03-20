import { Story } from '../../story/Story';

const patterns: Record<string, string> = {
  hexagonal: `## Hexagonal Architecture (Ports & Adapters)

- **Domain**: lógica de negócio pura, sem dependências externas
- **Ports (interfaces)**: contratos definidos pelo domínio
- **Adapters**: implementações de ports (HTTP, DB, mensageria)
- **Application Services**: orquestram casos de uso via ports
- Direção de dependência: Adapters → Application → Domain
- Nunca importe frameworks no domínio`,

  layered: `## Layered Architecture

- **Presentation**: controllers, views, API endpoints
- **Application**: casos de uso, DTOs, mapeamentos
- **Domain**: entidades, value objects, regras de negócio
- **Infrastructure**: repositórios, integrações externas
- Dependências fluem de cima para baixo — nunca inversas`,

  microservices: `## Microservices Architecture

- Cada serviço tem responsabilidade única e bem delimitada
- Comunicação via API ou eventos (sem chamada direta a banco alheio)
- Cada serviço gerencia seu próprio schema de banco de dados
- Circuit breaker e timeout obrigatórios em toda integração`,

  monolith: `## Modular Monolith

- Módulos bem delimitados com interfaces explícitas entre si
- Sem dependência circular entre módulos
- Shared kernel mínimo — preferir duplicação a acoplamento`,

  serverless: `## Serverless Architecture

- Funções stateless — sem estado em memória entre invocações
- Cold start: minimize dependências e tamanho do pacote
- Timeout e limites de memória definidos explicitamente
- Use armazenamento externo para estado persistente`,
};

export function generateArchPattern(story: Story): string {
  const arch = story.technicalSpec.architecture || 'layered';
  const detail = patterns[arch] ?? patterns['layered'];

  return `---
applyTo: "**"
---
# Architecture Pattern — Padrão Arquitetural

${detail}
`;
}
