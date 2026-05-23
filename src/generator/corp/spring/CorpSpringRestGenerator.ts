export function generateCorpSpringRest(): string {
  return `---
name: corp-spring-rest
description: "Corp padrões para REST controllers em Spring MVC (@RestController, ResponseEntity, @ControllerAdvice, versionamento /api/v{n}). Use quando implementar endpoints HTTP em Java/Spring."
applyTo: "**/*.java"
---
# Corp · Spring REST Controllers

## Estrutura
- Use \`@RestController\` (não \`@Controller\` + \`@ResponseBody\` manual).
- \`@RequestMapping("/api/v{n}/<recurso>")\` no nível de classe — versionamento explícito por URI.
- Métodos retornam \`ResponseEntity<T>\` quando precisarem controlar status/headers; senão, retornem o DTO direto com \`@ResponseStatus\` adequado.

## Validação
- DTOs de entrada anotados com \`jakarta.validation\` (\`@Valid\`, \`@NotNull\`, \`@Size\`, ...).
- Nunca aceite a entidade JPA como request body — sempre DTO.

## Erros (RFC 7807 — ProblemDetail)
- \`@ControllerAdvice\` global retornando \`ProblemDetail\` (Spring 6+).
- Habilite \`spring.mvc.problemdetails.enabled=true\`.
- Nunca vaze stack trace ou mensagem técnica do banco — log internamente, retorne \`type\`/\`title\`/\`detail\` controlados.

## Segurança e Observabilidade
- \`@PreAuthorize\` no método — não confie em filtros frágeis.
- Propague \`traceparent\` (W3C) recebido; gere quando ausente.
- Estruturar \`correlation-id\` no MDC do request.

## Paginação
- Endpoints de listagem aceitam \`Pageable\` e retornam \`Page<DTO>\` (ou envelope \`{ data, page, total }\`) — nunca \`List<T>\` sem limite.
`;
}
