export function generateContractTesting(): string {
  return `---
applyTo: "**"
---
# Contract Testing — BFF

## Por que contract tests no BFF

O BFF é consumidor de múltiplos downstream services. Qualquer breaking change de contrato
nos downstream quebra o BFF silenciosamente em produção — contract tests detectam isso antes do deploy.

## WireMock — Stubs para Testes de Integração

Use WireMock para simular respostas dos downstream services nos testes de integração do BFF.

Cenários de stub obrigatórios por downstream service integrado na story:

\`\`\`java
// Happy path — downstream retorna 200 com payload válido
stubFor(get(urlEqualTo("/api/orders/123"))
    .willReturn(aResponse().withStatus(200).withBody(orderJson)));

// Timeout — valida abertura de circuit breaker
stubFor(get(urlEqualTo("/api/catalog/456"))
    .willReturn(aResponse().withFixedDelay(5000).withStatus(200)));

// 500 downstream — valida normalização de erro para RFC 7807
stubFor(get(urlEqualTo("/api/inventory/789"))
    .willReturn(aResponse().withStatus(500)));
\`\`\`

## Checklist Gate 2 — BFF Contract Testing

- [ ] WireMock stubs criados para cada downstream service integrado nesta story
- [ ] Cenário de happy path coberto: BFF agrega e retorna resposta completa
- [ ] Cenário de 404 downstream coberto: BFF mapeia para resposta parcial ou \`404\` com ProblemDetail — nunca propaga raw
- [ ] Cenário de 500 downstream coberto: BFF retorna \`503\` ou resposta degradada — nunca propaga o \`500\`
- [ ] Cenário de timeout coberto: stub com delay > threshold configurado; circuit breaker abre; BFF retorna resposta degradada com \`Retry-After\`
- [ ] Downstream retorna payload inesperado (campo ausente, tipo errado): BFF não lança \`NullPointerException\` — trate defensivamente com Optional / null-safe access

## Consumer-Driven Contract Tests (Pact)

Quando o provider suporta Pact:

1. BFF (consumer) define interações no arquivo de contrato (\`contract/orders-service.json\`)
2. Provider executa o contrato contra sua implementação — falha = breaking change detectado antes do merge
3. Execute os testes de contrato no Gate 2 — não apenas em CI/CD

Estrutura recomendada:
\`\`\`
contract/
  orders-service.json
  catalog-service.json
  inventory-service.json
\`\`\`
`;
}
