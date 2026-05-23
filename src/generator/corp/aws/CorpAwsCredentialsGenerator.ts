export function generateCorpAwsCredentials(): string {
  return `---
name: corp-aws-credentials
description: "Corp padrões para credenciais AWS em runtime (IRSA, IAM Roles, credential provider chain). Use quando integrar com AWS via SDK, independente da linguagem."
---
# Corp · AWS Credentials & IRSA

## Estratégia padrão
- **Nunca** use access key / secret key em código ou arquivos de configuração.
- Em Kubernetes (EKS): use **IRSA** (IAM Roles for Service Accounts) via \`AWS_WEB_IDENTITY_TOKEN_FILE\` + \`AWS_ROLE_ARN\`.
- Em EC2/ECS: use \`InstanceProfileCredentialsProvider\` / Task Role.
- Em desenvolvimento local: SSO (\`aws sso login\`) ou perfil nomeado — não compartilhe credenciais.

## Credential Provider Chain
- Confie no **default provider chain** do SDK: \`Environment → WebIdentityTokenFile → ECS/EC2 metadata → Profile\`.
- Customize a chain apenas quando há requisito explícito; documente.
- Evite \`StaticCredentialsProvider\` exceto em testes locais isolados.

## Boas práticas
- Cliente SDK criado uma vez e reutilizado (pooling de conexões + cache de credenciais).
- Em runtime de longa duração: o SDK renova o token IRSA automaticamente — não implemente refresh manual.
- Configure timeouts (\`apiCallTimeout\`, \`apiCallAttemptTimeout\`) — não use defaults infinitos.

## Permissões
- IAM Role com policy de **least privilege** — escopo por recurso (ARN) e ação.
- Audite com IAM Access Analyzer / CloudTrail.
`;
}
