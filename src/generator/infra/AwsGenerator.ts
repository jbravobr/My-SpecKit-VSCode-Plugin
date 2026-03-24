import { Story } from '../../story/Story';

export function generateAws(_story: Story): string {
  return `---
applyTo: "**"
---
# AWS — Boas Práticas

## DynamoDB

- **Design access patterns antes do schema** — defina como os dados serão lidos/escritos antes de modelar as chaves; o contrário resulta em scans caros
- **Single-table design** quando múltiplos tipos de entidade compartilham os mesmos padrões de acesso; tabelas separadas quando os patterns divergem significativamente
- Convenção de chaves: \`PK: <ENTIDADE>#<id>\`, \`SK: <RELAÇÃO>#<id>\` — ex.: \`PK: PEDIDO#uuid\`, \`SK: ITEM#uuid\`
- **GSI** (Global Secondary Index) para padrões de acesso alternativos — planeje GSIs junto com os access patterns, não retroativamente
- **Nunca use \`FilterExpression\` como substituto de key design** — ele filtra após ler a partição completa; um FilterExpression que descarta 90% dos itens é um sinal de schema errado
- Modo de capacidade: **on-demand** para carga variável/imprevisível; **provisioned** apenas com dados de carga bem conhecidos e estáveis
- Defina atributo **TTL** para registros com expiração natural (sessões, tokens, dados de auditoria com retenção limitada)
- \`TransactWrite\` para operações atômicas em múltiplos itens — substitui transações ACID para casos simples
- \`ConditionExpression\` para **optimistic locking** — previne sobrescrita de versão desatualizada

## RDS Aurora / MySQL

- **Sempre use connection pool** — HikariCP (Java/Spring Boot) ou pool nativo do EF Core (.NET); nunca abra conexão fora do pool
- Configuração de pool inicial recomendada: \`minimumIdle=2\`, \`maximumPoolSize=10\`; ajuste conforme carga medida
- Fronteiras de transação **na camada de serviço**, não no repositório — o serviço decide o escopo da transação
- **Somente prepared statements** — nunca concatene strings para montar SQL; use \`@Query\` com parâmetros (Spring) ou LINQ (EF Core)
- Migrações via **Flyway** (Java) ou **EF Core Migrations** (.NET) — nunca DDL manual em produção; scripts versionados em controle de versão
- **Read replicas** para queries de leitura intensiva — configure endpoint de leitura separado; nunca rotear writes para réplica
- Nunca compartilhe uma conexão entre tasks assíncronas concorrentes — o pool gerencia isso; use padrões async/await corretamente

## Credenciais AWS

- Use **IAM roles** provisionadas pelo IDP — a role é atribuída à instância EC2 / task ECS; nenhuma credencial manual
- Nas SDKs: \`DefaultCredentialsProvider\` (Java SDK v2) / \`DefaultAWSCredentialsProviderChain\` (Java SDK v1) / \`boto3.Session()\` sem args (Python) — todos herdam a role automaticamente
- **Nunca** inclua \`accessKeyId\` / \`secretAccessKey\` em código, arquivos de configuração, variáveis de ambiente ou repositório
- Nunca passe credenciais como env vars configuradas por desenvolvedores — confie na role da instância/task
`;
}
