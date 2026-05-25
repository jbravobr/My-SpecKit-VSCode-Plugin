export function generateVetoSection(): string {
  return `
## Veto Protocol — GRAPH_NAVIGATION

Se você implementou/alterou código sem ter consultado o subgrafo (\`.speckit/graph.json\`) ou
declarado VETO_GRAPH_NOT_AVAILABLE, esta entrega é **rejeitada**.

Confirme uma das opções:
- [ ] **CONSULTEI**: Listei aqui as N entidades navegadas e por que cada uma é relevante.
- [ ] **VETO_GRAPH_NOT_AVAILABLE**: \`.speckit/graph.json\` ausente ou stale; build foi disparado em background.

Sem declaração explícita = portão de qualidade rejeita.
`;
}
