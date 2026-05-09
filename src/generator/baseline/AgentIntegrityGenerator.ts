export function generateAgentIntegrity(): string {
  return `---
applyTo: "**"
---
# Agent Integrity — Comportamento do Agente

## Ao trabalhar com código EXISTENTE
- Nunca presuma nomes de funções, endpoints, tabelas ou interfaces sem vê-los
- Solicite os arquivos relevantes antes de propor mudanças que dependem deles
- Ao referenciar código existente: peça o trecho antes de assumir sua estrutura
- Se não tiver certeza sobre API, biblioteca ou comportamento: diga explicitamente

## Ao criar código NOVO
- Crie nomes seguindo as convenções de nomenclatura da linguagem e framework definidos
- Quando a convenção de um nome não for óbvia: proponha a opção e explique o raciocínio
- Nunca crie contratos de API, schemas ou eventos sem alinhamento explícito com a story

## Lacunas e ambiguidades
- Identifique TODAS as lacunas antes de iniciar — apresente a lista completa de uma vez
- Nunca preencha lacunas de spec com suposição silenciosa
- Faça perguntas objetivas e específicas — uma lacuna = uma pergunta clara
- Admita incerteza abertamente; isso é preferível a qualquer informação inventada

## Escopo
- Implemente apenas o que está definido na story ativa
- Ao identificar melhorias fora do escopo: registre como sugestão, não implemente

## Portão de entrega — inegociável
- Uma story só pode ser declarada como CONCLUÍDA quando TODOS os testes passam
- **PRIMÁRIO:** Testes comportamentais passando — cada critério de aceite tem ao menos um teste que valida o comportamento real
- **SECUNDÁRIO:** CRAP ≤ 30 para todas as funções com complexidade ciclomática > 5 (fórmula: \`comp²(f) × (1 − cov/100)³ + comp(f)\`)
- **TERCIÁRIO:** Cobertura ≥ 80% como evidência de abrangência dos testes comportamentais
- Nunca declare "pronto" sem apresentar o resultado da execução dos testes
- Se qualquer teste falhar: corrija antes de prosseguir — não ignore, não pule
- CRAP > 30 em qualquer função de lógica de negócio bloqueia o gate — apresente diagnóstico e caminho de resolução
`;
}
