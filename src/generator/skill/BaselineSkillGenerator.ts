import { NonFunctionalSpec, Story } from '../../story/Story';
import { generateAgentIntegrity } from '../baseline/AgentIntegrityGenerator';
import { generateArchitecture } from '../baseline/ArchitectureGenerator';
import { generateContextManagement } from '../baseline/ContextManagementGenerator';
import { generateCredentialSecurity } from '../baseline/CredentialSecurityGenerator';
import { generateGitWorkflow } from '../baseline/GitWorkflowGenerator';
import { generateGraphNavigation } from '../baseline/GraphNavigationGenerator';
import { generateIdempotency } from '../baseline/IdempotencyGenerator';
import { generateObservability } from '../baseline/ObservabilityGenerator';
import { generatePerformance } from '../baseline/PerformanceGenerator';
import { generateSecurityTests } from '../baseline/SecurityTestsGenerator';
import { generateTestingStandards } from '../baseline/TestingStandardsGenerator';
import { stripFrontmatter } from './stripFrontmatter';

export interface BaselineFile {
  filename: string;
  content: string;
}

const CONDENSED_CREDENTIALS = `# Gestão de Credenciais — Regras Críticas (resumo)

> Versão condensada das regras inegociáveis. Para detalhes (IAM, Secrets Manager,
> rotação, testes), leia **REFERENCE-credentials.md**.

- **Nunca** comite segredo (senha, token, chave, certificado) em código, config (\`application.yml\`,
  \`appsettings.json\`, \`.env\`), Dockerfile, repositório, ticket, log ou commit message.
- **Em runtime**, prefira IAM roles (EC2 Instance Profile, ECS Task Role, IRSA no Kubernetes, OIDC
  no GitHub Actions). Access keys só para CI/CD sem OIDC, com rotação ≤ 90 dias.
- **Recupere segredos via SDK no runtime** (Secrets Manager, SSM, Vault, Key Vault) — nunca via
  env var preenchida manualmente. Cache TTL ≤ 15 min, tolerância a rotação.
- **Antes de commitar**, scan obrigatório (gitleaks, trufflehog ou equivalente). Pre-commit hook
  é obrigatório para projetos novos.`;

const CONDENSED_IDEMPOTENCY = `# Idempotência — Regras Críticas (resumo)

> Versão condensada. Para tabela completa de respostas HTTP, deduplicação e armazenamento,
> leia **REFERENCE-idempotency.md**.

- **PUT** é naturalmente idempotente — mesmo body → mesmo estado.
- **POST/PATCH** não-idempotentes **devem** aceitar header \`Idempotency-Key\` (UUID v4) e
  retornar o mesmo resultado em retentativas com a mesma chave (TTL ≥ 24h).
- **Deduplique por chave de negócio** antes de persistir (\`ON CONFLICT DO NOTHING\`, condition
  expression, business ID).`;

const GATE_IMPERATIVE = `# REGRA INEGOCIÁVEL — Pré-requisito de leitura

Antes de qualquer ação na coluna esquerda, você **deve** ler primeiro o arquivo da direita.
Se não leu, **pare**. Violação = entrega rejeitada no portão de qualidade.

| Ação que vou executar | Arquivo obrigatório |
|---|---|
| \`git commit\`, \`git push\`, abrir PR | REFERENCE-git.md |
| Tocar em segredo, env var, IAM, KMS, Vault | REFERENCE-credentials.md |
| Implementar endpoint POST / PUT / PATCH | REFERENCE-idempotency.md |
| Adicionar rota com autenticação ou validação de input | REFERENCE-security.md |
| Criar, alterar ou rever teste | REFERENCE-testing.md |
| Adicionar log estruturado, métrica, trace ou health check | REFERENCE-observability.md |
| Implementar/alterar/refatorar código em repositório carregado | REFERENCE-graph.md |

Ao iniciar uma das ações acima, **declare**: "Vou fazer X. Lendo REFERENCE-Y.md." Sem declaração,
a ação não está autorizada.`;

function buildSkillMd(story: Story | undefined, nfr: NonFunctionalSpec | undefined): string {
  const coreSections = [
    stripFrontmatter(generateAgentIntegrity()),
    stripFrontmatter(generatePerformance(nfr)),
    stripFrontmatter(generateArchitecture()),
    stripFrontmatter(generateContextManagement()),
    CONDENSED_CREDENTIALS,
    CONDENSED_IDEMPOTENCY,
    GATE_IMPERATIVE,
  ];

  // Silence unused-parameter warning — story is reserved for future per-story tuning.
  void story;

  return `---
name: speckit-baseline
description: "SpecKit engineering baseline — agent integrity, performance, architecture, context management, condensed credential & idempotency rules, plus mandatory reading gate. Use when implementing, reviewing, or testing code in a SpecKit-managed project."
---

# SpecKit Baseline

## Quick start

Antes de qualquer ação:

1. **Não invente** — confirme nome de arquivo, função ou contrato antes de afirmar que existe.
2. **Implemente apenas o pedido** — sugira melhorias, não as faça silenciosamente.
3. **Evidência > intenção** — type-check + testes verdes são o portão de entrega, não "o build passou".
4. **Pergunte antes** quando o requisito for ambíguo ou contraditório.
5. **Cobertura mínima ≥ 80%** para o código alterado.

Esta skill contém os princípios de comportamento + regras críticas condensadas + tabela de leitura
obrigatória. Material consultivo de domínios específicos vive nos arquivos \`REFERENCE-*.md\` ao
lado deste \`SKILL.md\` — leia-os conforme a tabela do gate antes da ação correspondente.

${coreSections.join('\n---\n\n')}
`;
}

function buildReference(domain: string, body: string): string {
  return `> **REFERÊNCIA do speckit-baseline.** Leia este arquivo antes de executar a ação correspondente
> na tabela de gate do \`SKILL.md\` (domínio: \`${domain}\`).

${body}`;
}

export function generateBaselineSkill(story?: Story): BaselineFile[] {
  const nfr: NonFunctionalSpec | undefined = story?.nonFunctionalSpec;

  return [
    { filename: 'SKILL.md', content: buildSkillMd(story, nfr) },
    {
      filename: 'REFERENCE-testing.md',
      content: buildReference('testing', stripFrontmatter(generateTestingStandards(story))),
    },
    {
      filename: 'REFERENCE-git.md',
      content: buildReference('git', stripFrontmatter(generateGitWorkflow())),
    },
    {
      filename: 'REFERENCE-credentials.md',
      content: buildReference('credentials', stripFrontmatter(generateCredentialSecurity())),
    },
    {
      filename: 'REFERENCE-observability.md',
      content: buildReference('observability', stripFrontmatter(generateObservability(nfr))),
    },
    {
      filename: 'REFERENCE-security.md',
      content: buildReference('security', stripFrontmatter(generateSecurityTests())),
    },
    {
      filename: 'REFERENCE-idempotency.md',
      content: buildReference('idempotency', stripFrontmatter(generateIdempotency())),
    },
    {
      filename: 'REFERENCE-graph.md',
      content: buildReference('graph', stripFrontmatter(generateGraphNavigation())),
    },
  ];
}
