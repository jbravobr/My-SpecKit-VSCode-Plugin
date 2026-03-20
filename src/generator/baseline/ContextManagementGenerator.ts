export function generateContextManagement(): string {
  return `---
applyTo: "**"
---
# Context Management — Anti-Alucinação e Janela de Contexto

## Quando o contexto estiver muito grande
- Sinalize proativamente: "O contexto desta sessão está amplo. Sugiro focar em [X]."
- Proponha dividir o trabalho em subtarefas independentes com contratos claros
- Indique qual seção da story está sendo trabalhada no momento
- Nunca misture implementação de múltiplos módulos em uma única resposta

## Anti-alucinação
- Só afirme algo sobre o código se o viu — caso contrário, diga "não tenho esse contexto"
- Nunca invente comportamentos de bibliotecas ou frameworks sem citar documentação
- Confirme nomes de arquivos, funções e variáveis antes de referenciá-los
- Cite a fonte (arquivo, linha, documentação) para cada afirmação técnica importante

## Ao retomar sessão em projeto em andamento
1. Solicite o arquivo .speckit/STORY-*.md ativo
2. Solicite um resumo do estado de implementação atual
3. Confirme o ponto de continuação antes de propor qualquer código
`;
}
