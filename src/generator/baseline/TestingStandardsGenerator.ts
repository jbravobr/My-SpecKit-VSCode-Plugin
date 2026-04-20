import { Story } from '../../story/Story';

export function generateTestingStandards(story?: Story): string {
  const criteriaSection = buildAcceptanceCriteriaSection(story);
  const perfSection = buildPerformanceTestSection(story);

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
${criteriaSection}
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
${perfSection}
## O que NÃO é aceitável
- **"Build passou, então funciona"** — build com transpiladores (esbuild, swc, tsc emit) NÃO verifica tipos. Execute \`tsc --noEmit\` (TS), \`mypy\` (Python), \`dotnet build\` (C#) como gate separado
- Testes que cobrem apenas o happy path — edge e error cases são obrigatórios
- Testes sem assertivas (\`expect\`, \`assert\`, \`verify\`)
- Mocks que ocultam comportamento real de lógica de domínio
- \`skip\`, \`xtest\`, \`@Ignore\`, \`xit\` sem comentário explicando o motivo e issue de rastreamento
- Cobertura abaixo de 80% — nenhuma exceção sem aprovação explícita do time
- Mocks não-tipados (\`vi.fn()\` retornando \`any\`, \`{} as any\`) — use stubs tipados que implementam a interface real
`;
}

function buildAcceptanceCriteriaSection(story?: Story): string {
  const criteria =
    story?.functionalSpec?.acceptanceCriteria?.filter((c) => c.trim().length > 0) ?? [];
  if (criteria.length === 0) return '';

  const items = criteria.map((c) => `  - \`${c.trim()}\``).join('\n');
  return `
## Cenários mínimos obrigatórios derivados dos critérios de aceite
Os cenários abaixo são o mínimo esperado — cada critério de aceite deve ter ao menos um teste:
${items}
`;
}

function buildPerformanceTestSection(story?: Story): string {
  const declared = story?.nonFunctionalSpec?.performance?.trim();
  const perf = declared || 'P99 < 500ms (baseline padrão — nenhum NFR declarado)';
  const label = declared ? `NFR declarado: ${perf}` : `baseline padrão: ${perf}`;

  const langHint = buildPerfToolHint(story);
  return `
## Teste de performance — ${label}
- Esta story define um requisito de latência. O Gate 2 exige validação deste NFR por teste de carga
- Ferramenta sugerida: ${langHint}
- Cenário mínimo: simular carga realista no endpoint principal e verificar que P99 ≤ threshold declarado
- O teste de performance deve ser executável em CI (sem dependência de ambiente externo)
- Resultado do teste de carga deve ser incluído no relatório do Gate 2
`;
}

function buildPerfToolHint(story?: Story): string {
  const lang = story?.technicalSpec?.language;
  switch (lang) {
    case 'typescript':
    case 'javascript':
      return 'k6 (`k6 run load-test.js`) ou autocannon (`autocannon -c 50 -d 30 http://localhost:3000/endpoint`)';
    case 'java':
      return 'Gatling (Maven plugin: `./mvnw gatling:test`) ou k6';
    case 'python':
      return 'Locust (`locust -f locustfile.py --headless -u 50 -r 10`) ou k6';
    case 'csharp':
      return 'NBomber ou k6';
    default:
      return 'k6 (recomendado para qualquer stack)';
  }
}
