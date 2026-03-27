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

## Spring Data JPA
- Nomenclatura de query derivation para queries simples; \`@Query\` com JPQL para consultas complexas
- Projections (interfaces ou records) para leituras parciais — evite SELECT * via fetch de entidade em paths read-only
- Adicione parâmetro \`Pageable\` em métodos de repositório que retornam listas
- Nunca retorne \`List<Entity>\` sem paginação em endpoints de listagem

## Spring Kafka
- \`@KafkaListener\` para consumers; configure \`ConsumerFactory\` bean explicitamente — não dependa dos defaults do auto-config
- \`KafkaTemplate<K,V>\` para producers; trate falha de envio via \`CompletableFuture\`
- Use \`@RetryableTopic\` com \`backoff\` + \`attempts\` + DLT configurado

## Observabilidade
- Spring Actuator: exponha \`/health\` e \`/metrics\`; restrinja demais endpoints em produção via \`management.endpoints.web.exposure.include\`
- Micrometer: registre \`Counter\` e \`Timer\` customizados para eventos de negócio relevantes
- MDC: popule \`traceId\` e \`spanId\` no ponto de entrada da requisição (filter ou interceptor); inclua em todos os logs

## Exception Handling (atualizado)
- \`@ControllerAdvice\` deve retornar \`ProblemDetail\` (Spring 6+, RFC 7807) — substitua bodies de erro customizados; habilite com \`spring.mvc.problemdetails.enabled=true\`
- \`@PreAuthorize\` para autorização em nível de método — nunca confie em headers do cliente para identidade

## Spring Boot 3.3+ — Recursos modernos
- **Virtual threads**: habilite com \`spring.threads.virtual.enabled=true\` (application.yml) — Tomcat e agendadores usarão virtual threads automaticamente; remove necessidade de tuning de pool para I/O-bound
- **\`@HttpExchange\`**: cliente HTTP declarativo nativo (substitui Feign) — defina interface com \`@GetExchange\`/\`@PostExchange\`, registre via \`HttpServiceProxyFactory\`; sem dependência externa
- **Testes**: use \`@ImportAutoConfiguration\` em vez de \`@SpringBootTest\` para testes de slice mais rápidos; \`@RestClientTest\` para testar \`@HttpExchange\` clients com \`MockRestServiceServer\`
`;
}
