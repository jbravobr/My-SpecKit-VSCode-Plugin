import { NonFunctionalSpec } from '../../story/Story';

export function generatePerformance(nfr?: NonFunctionalSpec): string {
  const latency = nfr?.performance?.trim() || 'P99 < 500ms';
  const availability = nfr?.availability?.trim() || '99,9%';
  const defaultNote = !nfr?.performance?.trim()
    ? '\n> ⚠ Nenhum NFR de performance declarado na story — aplicando baseline padrão.'
    : '';

  return `---
applyTo: "**"
---
# Performance — Obsessão com Eficiência Algorítmica

## Constraint desta story
- **Latência P99**: ${latency}
- **Disponibilidade**: ${availability}${defaultNote}

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
