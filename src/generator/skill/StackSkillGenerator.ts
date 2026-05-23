import { Story } from '../../story/Story';
import { generateIdempotency } from '../baseline/IdempotencyGenerator';
import { generateAngular } from '../framework/AngularGenerator';
import { generateDotNet } from '../framework/DotNetGenerator';
import { generateFastApi } from '../framework/FastApiGenerator';
import { generateReact } from '../framework/ReactGenerator';
import { generateSpringBoot } from '../framework/SpringBootGenerator';
import { generateAws } from '../infra/AwsGenerator';
import { generateGlueJob } from '../infra/GlueJobGenerator';
import { generateKafka } from '../infra/KafkaGenerator';
import { generateCSharp } from '../language/CSharpGenerator';
import { generateJava } from '../language/JavaGenerator';
import { generateJavaScript } from '../language/JavaScriptGenerator';
import { generatePython } from '../language/PythonGenerator';
import { generateTypeScript } from '../language/TypeScriptGenerator';
import { generateBffPattern } from '../pattern/BffPatternGenerator';
import { generateContractTesting } from '../pattern/ContractTestingGenerator';
import { generateCrudPattern } from '../pattern/CrudPatternGenerator';
import { isNa } from '../utils/na';
import { stripFrontmatter } from './stripFrontmatter';

interface StackSkillOptions {
  language: string;
  framework: string;
  infrastructure?: string;
  database?: string;
  target?: string;
}

export function generateStackSkill(opts: StackSkillOptions, story?: Story): string {
  const sections: string[] = [];
  const stackParts: string[] = [];

  // Language
  const langGenerators: Record<string, () => string> = {
    typescript: generateTypeScript,
    javascript: generateJavaScript,
    java: generateJava,
    csharp: generateCSharp,
    python: generatePython,
  };
  const langGen = langGenerators[opts.language];
  if (langGen) {
    sections.push(stripFrontmatter(langGen()));
    stackParts.push(opts.language);
  }

  // Framework
  const fwGenerators: Record<string, () => string> = {
    dotnet: generateDotNet,
    springboot: generateSpringBoot,
    angular: generateAngular,
    react: generateReact,
    fastapi: generateFastApi,
  };
  const fwGen = fwGenerators[opts.framework];
  if (fwGen) {
    sections.push(stripFrontmatter(fwGen()));
    stackParts.push(opts.framework);
  }

  // Infra — conditional
  const infra = opts.infrastructure ?? '';
  const db = opts.database ?? '';
  const infraLc = infra.toLowerCase();
  const dbLc = db.toLowerCase();

  if (!isNa(infra) && infraLc.includes('kafka')) {
    sections.push(stripFrontmatter(generateKafka()));
    stackParts.push('kafka');
  }

  const needsAws =
    !isNa(db) &&
    (dbLc.includes('dynamodb') ||
      dbLc.includes('aurora') ||
      dbLc.includes('rds') ||
      dbLc.includes('mysql'));
  if (needsAws) {
    sections.push(
      stripFrontmatter(
        generateAws(
          story ?? ({ technicalSpec: { database: db, infrastructure: '' } } as unknown as Story),
        ),
      ),
    );
    stackParts.push('aws');
  }

  if (
    (!isNa(infra) && infraLc.includes('glue')) ||
    (opts.language === 'python' && opts.target === 'script')
  ) {
    sections.push(stripFrontmatter(generateGlueJob()));
    stackParts.push('glue');
  }

  // Patterns — conditional
  if (opts.target === 'backend' || opts.target === 'bff') {
    sections.push(stripFrontmatter(generateCrudPattern(opts.language, opts.framework)));
    sections.push(stripFrontmatter(generateIdempotency()));
  }

  if (opts.target === 'bff') {
    sections.push(stripFrontmatter(generateBffPattern()));
    sections.push(stripFrontmatter(generateContractTesting()));
  }

  const stackLabel = stackParts.join(', ') || 'generic';

  // Mock library recommendation per language
  const mockSection = buildMockRecommendation(opts.language);

  return `---
name: speckit-stack
description: "SpecKit stack conventions — ${stackLabel}. Best practices for ${opts.language || 'general'} language, ${opts.framework || 'general'} framework, infrastructure, and architectural patterns. Use when writing or reviewing code in a SpecKit-managed project."
---

# SpecKit Stack — ${stackLabel}

## Quick start

Antes de tocar em qualquer código desta stack:

1. **Qual contrato?** — confirme a assinatura/protocolo (HTTP, mensagem, interface) antes de implementar.
2. **Qual o teste primeiro?** — escolha o tipo (unitário, integração, contrato) e escreva a expectativa antes do código.
3. **Qual padrão da stack?** — siga os padrões abaixo desta seção, não invente novos.

${sections.join('\n---\n\n')}
${mockSection}
`;
}

function buildMockRecommendation(language: string): string {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return `---

# Mocks e Stubs — Recomendações

- **Prefira stubs tipados** que implementam a interface real (ex: \`InMemoryFileSystem implements IFileSystem\`)
- Evite \`vi.fn()\` / \`jest.fn()\` retornando \`any\` — crie factories tipadas: \`createMockStream(): ChatResponseStream\`
- Evite \`{} as any\` para parâmetros — crie factories que retornam o tipo completo
- Mocks não-tipados escondem erros de compilação — \`tsc --noEmit\` não detecta \`as any\`
- Use \`vi.fn()\` apenas para verificar que um método foi chamado, nunca para retornar dados de domínio
`;
    case 'java':
      return `---

# Mocks e Stubs — Recomendações

- **Prefira fakes in-memory** que implementam a interface real (ex: \`InMemoryRepository implements UserRepository\`)
- Mockito: use \`@Mock\` + \`@InjectMocks\` com types reais — evite \`Mockito.any()\` em assertions
- Evite mocks profundos (\`RETURNS_DEEP_STUBS\`) — indica design frágil
- Use \`verify()\` para interações, \`assertThat()\` para resultados — nunca misture papéis
`;
    case 'python':
      return `---

# Mocks e Stubs — Recomendações

- **Prefira fakes tipados** que implementam a mesma Protocol/ABC (ex: \`InMemoryRepo(UserRepository)\`)
- \`unittest.mock.Mock\` sem \`spec\` aceita qualquer atributo — sempre use \`spec=InterfaceReal\`
- Prefira \`create_autospec()\` sobre \`Mock()\` genérico para garantir conformidade com a interface
- Use \`pytest.fixture\` para factories de stubs reutilizáveis
`;
    case 'csharp':
      return `---

# Mocks e Stubs — Recomendações

- **Prefira fakes in-memory** que implementam a interface (ex: \`InMemoryRepository : IUserRepository\`)
- Moq: use \`Mock<IService>()\` com tipo real — evite \`It.IsAny<object>()\` em assertions
- Prefer \`Substitute.For<IService>()\` (NSubstitute) para setup mais limpo
- Evite \`Mock.Of<>() \` com LINQ — difícil de debugar quando falha
`;
    default:
      return '';
  }
}
