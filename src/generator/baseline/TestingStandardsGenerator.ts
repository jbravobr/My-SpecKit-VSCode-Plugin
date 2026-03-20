export function generateTestingStandards(): string {
  return `---
applyTo: "**"
---
# Testing Standards — Qualidade e Cobertura Obrigatória

## Regra absoluta de entrega
- Uma story só pode ser marcada como CONCLUÍDA quando 100% dos testes passam
- Cobertura mínima de 80% é condição sine qua non — não negocie isso
- Nunca declare uma implementação como pronta sem executar os testes e apresentar o resultado
- Se qualquer teste falhar: corrija a implementação ou o teste antes de prosseguir

## O que testar obrigatoriamente
- **Happy path**: fluxo principal funcionando exatamente conforme os critérios de aceite
- **Edge cases**: limites de entrada — zero, null, string vazia, lista vazia, valor máximo, valor mínimo
- **Error cases**: falhas esperadas — validação inválida, not found, conflito, permissão negada, timeout
- **Cenários da story**: todos os cenários trazidos pelo usuário durante a criação da história
- **Cenários derivados**: casos que emergem da implementação e não estavam explícitos na story
- **Integrações**: contratos entre camadas — use mocks apenas para dependências externas reais (banco, HTTP)

## Organização dos testes
- Um arquivo de teste por arquivo de produção
- Estrutura obrigatória: **Arrange → Act → Assert** (AAA)
- Cada teste tem exatamente um motivo para falhar — sem testes "gordos"
- Nomes descritivos que documentam o comportamento esperado:
  - Português: \`deve_lancar_erro_quando_usuario_nao_encontrado\`
  - Inglês: \`should_throw_error_when_user_not_found\`

## Nomenclatura por linguagem
- TypeScript/JavaScript: \`<arquivo>.test.ts\` ou \`<arquivo>.spec.ts\`
- Java: \`<Classe>Test.java\` (JUnit) ou \`<Classe>Spec.groovy\` (Spock)
- C#: \`<Classe>Tests.cs\` (xUnit/NUnit)
- Python: \`test_<arquivo>.py\` (pytest)

## O que NÃO é aceitável
- Testes que cobrem apenas o happy path — edge e error cases são obrigatórios
- Testes sem assertivas (\`expect\`, \`assert\`, \`verify\`)
- Mocks que ocultam comportamento real de lógica de domínio
- \`skip\`, \`xtest\`, \`@Ignore\`, \`xit\` sem comentário explicando o motivo e issue de rastreamento
- Cobertura abaixo de 80% — nenhuma exceção sem aprovação explícita do time
`;
}
