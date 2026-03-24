export function generateCredentialSecurity(): string {
  return `---
applyTo: "**"
---
# Gestão de Credenciais — Regras Absolutas

## IAM e Identidade

- Prefira IAM roles a access keys em todos os contextos de runtime:
  - EC2 / ECS / Lambda: Instance Profile / Task Role / Execution Role
  - GitHub Actions: OIDC provider — nunca armazene \`AWS_ACCESS_KEY_ID\` como repository secret
  - Kubernetes: IRSA (IAM Roles for Service Accounts) — nunca monte credenciais como volumes
- Access keys são proibidas para workloads de runtime; use apenas para CI/CD sem suporte a OIDC, com rotação ≤ 90 dias

## Gerenciadores de Segredos

- Recupere segredos em tempo de runtime via SDK, nunca via variável de ambiente preenchida manualmente:
  - AWS: \`SecretsManager.getSecretValue()\` / \`SSM.getParameter(WithDecryption=true)\`
  - Azure: \`SecretClient.getSecret()\` (Azure Key Vault)
  - HashiCorp Vault: \`vault.read()\` com AppRole ou Kubernetes auth
- Nunca injete o valor do segredo em uma variável de ambiente acessível por todo o processo — passe diretamente para o construtor ou método que necessita do valor
- Cache local de segredos: TTL máximo de 15 minutos; implemente invalidação e refresh antes de operações críticas
- Sua aplicação deve tolerar rotação sem downtime: tente a credencial nova em caso de falha de autenticação antes de retornar erro

## O que NUNCA fazer — lista inegociável

Nenhum segredo (senha, token, chave, certificado privado) em:

- Código-fonte (qualquer linguagem, qualquer arquivo)
- Arquivos de configuração: \`application.yml\`, \`appsettings.json\`, \`.env\`, \`config.py\`
- Variáveis de ambiente definidas em \`Dockerfile\`, \`docker-compose.yml\`, Kubernetes \`Deployment\` (use \`secretRef\`)
- Histórico git — um segredo comitado é um segredo comprometido, mesmo após remoção posterior
- Logs de aplicação — máscaras de log obrigatórias para campos: \`password\`, \`secret\`, \`token\`, \`key\`, \`authorization\`, \`credential\`
- Mensagens de erro retornadas ao cliente
- Outputs de CI/CD (use \`::add-mask::\` no GitHub Actions, \`[MASKED]\` no GitLab)

## Rotação de Credenciais

- Toda credencial de longa duração deve ter rotação configurada:
  - AWS Secrets Manager: rotação automática via Lambda rotation function
  - Azure Key Vault: policy de rotação com notificação de expiração
  - Rotação manual: defina ciclo máximo no README de operação (ex.: 90 dias) e registre em runbook
- A aplicação deve detectar falha de autenticação e tentar a nova credencial antes de propagar o erro

## Credenciais em Testes

- Testes de integração: use containers locais (Testcontainers, LocalStack) — nunca aponte para serviços de produção
- Fixtures de teste: nunca use credenciais reais, mesmo para ambientes de desenvolvimento
- Pre-commit hook obrigatório: \`git-secrets\` ou \`trufflehog\` para detecção de segredos antes do push
`;
}
