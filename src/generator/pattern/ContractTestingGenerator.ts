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

## Pact por linguagem do BFF consumer

**TypeScript / JavaScript (pact-js):**
\`\`\`typescript
// consumer side — define a interação
const interaction = pact.addInteraction({
  state: 'order 123 exists',
  uponReceiving: 'a request for order 123',
  withRequest: { method: 'GET', path: '/api/orders/123' },
  willRespondWith: { status: 200, body: { id: '123', status: 'open' } },
});
// execute o test e publique o contrato gerado em contract/orders-service.json
\`\`\`

**Python (pact-python):**
\`\`\`python
# consumer side
pact.given('order 123 exists') \\
    .upon_receiving('a request for order 123') \\
    .with_request('GET', '/api/orders/123') \\
    .will_respond_with(200, body={'id': '123', 'status': 'open'})
\`\`\`

**Java (pact-jvm) — já coberto nos exemplos WireMock acima.**

> Os exemplos WireMock no topo desta instrução usam sintaxe Java — em projetos TypeScript ou Python adapte os stubs à biblioteca equivalente (\`msw\`, \`responses\`, \`httpretty\`).
`;
}
