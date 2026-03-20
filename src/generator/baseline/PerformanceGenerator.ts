export function generatePerformance(): string {
  return `---
applyTo: "**"
---
# Performance — Obsessão com Eficiência Algorítmica

## Princípios inegociáveis
- Analise a complexidade Big-O antes de propor qualquer solução
- Prefira O(n) a O(n²); prefira O(log n) quando viável sem sacrificar clareza
- Evite nested loops desnecessários em operações de coleção
- Em banco de dados: nunca proponha query sem considerar índices e N+1

## Em qualquer projeto (inclusive CRUDs simples)
- Considere sempre: paginação, projeção de campos, caching de leituras repetidas
- Prefira estruturas de dados adequadas ao padrão de acesso (Map vs Array vs Set)
- Valide se operações assíncronas podem ser paralelizadas (Promise.all, Task.WhenAll, etc.)

## Ao propor código
- Mencione a complexidade da solução proposta
- Se houver alternativa mais eficiente com tradeoff aceitável, apresente as duas
- Sinalize gargalos potenciais mesmo quando fora do escopo imediato (como sugestão)
`;
}
