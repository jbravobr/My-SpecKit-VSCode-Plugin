export function generateCorpNamingConventions(): string {
  return `---
name: corp-naming-conventions
description: "Corp convenções de nomenclatura (*UseCase, *Gateway, *Repository, *Controller) e estrutura de pacotes. Use quando criar classes/módulos novos em qualquer linguagem orientada a objetos."
---
# Corp · Naming & Package Structure

## Sufixos por papel
- \`*UseCase\` — orquestra um caso de uso completo. Sem lógica de framework.
- \`*Gateway\` — porta de saída para sistema externo (HTTP, message broker, storage).
- \`*Repository\` — persistência (DB).
- \`*Controller\` / \`*Resource\` — adapter de entrada HTTP.
- \`*Listener\` / \`*Consumer\` — adapter de entrada de mensageria.
- \`*Mapper\` — conversão entre camadas (entidade ↔ DTO).
- \`*Validator\` — validação de regra explícita.

## Estrutura de pacotes (hexagonal / clean)
\`\`\`
<root>/
  domain/        # entidades, value objects, exceções de domínio (puro)
  application/   # use cases, ports (interfaces)
  infrastructure/
    adapters/
      in/        # controllers, listeners
      out/       # gateways, repositories
    config/      # beans, properties
\`\`\`

## Princípios
- **Single Responsibility** por classe; arquivo nomeia a classe.
- **No framework leakage** no \`domain\` — sem \`@Entity\`, \`@Component\`, imports de Spring/Mongoose/etc.
- Interfaces de porta moram em \`application\`; implementações em \`infrastructure/adapters/out\`.
- Constructor injection sempre — sem field injection ou setter injection.

## Mensageria / Eventos
- Eventos: \`<Dominio><Acao>Event\` (passado: \`PagamentoAprovadoEvent\`).
- Comandos: \`<Acao><Dominio>Command\` (imperativo: \`AprovarPagamentoCommand\`).

## DTOs
- \`<Recurso>Request\` para entrada, \`<Recurso>Response\` para saída.
- Imutáveis (records / readonly / frozen) sempre que possível.
`;
}
