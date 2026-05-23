export function generateCorpAwsSecrets(): string {
  return `---
name: corp-aws-secrets
description: "Corp padrões para AWS Secrets Manager (cache, deserialização tipada, retry, tratamento de erro). Use quando qualquer consumidor SDK AWS (Node, Python, .NET, Java) recuperar secrets."
---
# Corp · AWS Secrets Manager

## Recuperação
- Use o SDK oficial AWS (\`aws-sdk-v3\`/\`boto3\`/\`AWSSDK.SecretsManager\`/\`software.amazon.awssdk\`).
- **Cache em memória** com TTL curto (5–15 min) — não chame \`GetSecretValue\` em cada request.
- Considere o **AWS Secrets Manager Caching Client** quando disponível para a linguagem.

## Deserialização tipada
- Secrets de JSON estruturado → deserialize para tipo forte (record/dataclass/struct/POJO).
- Valide presença de campos obrigatórios antes do uso; falhe rápido com mensagem clara.

## Retry e erros
- Trate \`ResourceNotFoundException\`, \`AccessDeniedException\`, \`DecryptionFailureException\` distintamente.
- Throttling (\`ThrottlingException\`) → backoff exponencial com jitter (SDK default geralmente já cobre).
- **Nunca** logue o valor do secret. Logue apenas \`secretId\` + status.

## Rotação
- Assuma que o secret pode rotacionar a qualquer momento — invalide o cache em falha de autenticação subsequente.
- Para credenciais de DB, prefira IAM Authentication quando disponível em vez de username/password armazenado.

## Segurança
- IAM policy mínima: \`secretsmanager:GetSecretValue\` restrito ao ARN específico.
- KMS key da política tem \`kms:Decrypt\` apenas para os princípios necessários.
`;
}
