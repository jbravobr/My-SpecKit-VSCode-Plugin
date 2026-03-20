export function generateSpringBoot(): string {
  return `---
applyTo: "**/*.java"
---
# Spring Boot — Boas Práticas

## Injeção de Dependência
- **Constructor injection** obrigatório — nunca \`@Autowired\` em campo
- Use \`@RequiredArgsConstructor\` (Lombok) com campos \`final\`
- Omita \`@Autowired\` quando há um único construtor

## Camadas e Padrões
- Respeite: Controller → Service → Repository — sem saltar camadas
- Services são transacionais: use \`@Transactional\` no nível de serviço
- Repositories estendem JpaRepository — sem SQL nativo sem justificativa

## Configuração e Perfis
- Use \`application.yml\` com perfis (dev, prod, test) — sem hardcode de valores
- Externalize configurações em \`@ConfigurationProperties\`
- Use \`@ControllerAdvice\` para tratamento global de exceções
`;
}
