import { Story } from '../../story/Story';

const patterns: Record<string, string> = {
  hexagonal: `## Hexagonal Architecture (Ports & Adapters)

- **Domain**: lógica de negócio pura, zero dependências externas (sem imports de framework)
- **Application (UseCaseInteractor)**: orquestra o domínio via interfaces de port — sem HTTP, sem DB, sem Kafka aqui
- **Domain Services**: lógica stateless que envolve múltiplas entidades de domínio mas pertence ao domínio (não à camada de aplicação)
- **Ports — Input** (\`XxxInputPort\`): interface acionada pela aplicação — ponto de entrada do caso de uso
- **Ports — Output** (\`XxxOutputPort\`): interface que aciona infraestrutura — ex.: repositório, mensageria
- **Adapters — Input**: \`XxxController\` (HTTP), \`XxxConsumer\` (Kafka) — traduz sinal externo em chamada de caso de uso
- **Adapters — Output**: \`XxxJpaAdapter\`, \`XxxKafkaAdapter\`, \`XxxS3Adapter\` — implementam output ports
- Direção de dependência: Adapters → Application → Domain (nunca invertida)
- Nunca importe anotações Spring/Kafka/JPA em interfaces de port ou no domínio
- **Estratégia de testes**: domínio = testes unitários puros sem infraestrutura; adapters = testes de integração (Testcontainers, embedded Kafka)`,

  layered: `## Layered Architecture

- **Presentation**: controllers e API endpoints — recebe requests HTTP, delega para Application, retorna DTOs de resposta
  - Nunca implemente lógica de negócio aqui; nunca acesse repositórios diretamente
  - Validação de input acontece nesta camada (Bean Validation / FluentValidation / Pydantic)
- **Application (Service layer)**: orquestra casos de uso — coordena entidades, repositórios e eventos
  - Transações delimitadas aqui (\`@Transactional\` / \`TransactionScope\` / unit of work)
  - Sem dependência direta de HTTP ou detalhes de persistência
- **Domain**: entidades, value objects, regras de negócio puras
  - Pode ser chamado pela Application — nunca chama Application de volta
  - Zero dependências de framework; testável com testes unitários puros
- **Infrastructure**: implementações de repositório, clientes HTTP externos, producers de mensageria
  - Nenhuma camada superior importa de Infrastructure diretamente — Application usa interfaces definidas em Domain
- Direção de dependência: Presentation → Application → Domain ← Infrastructure (Infrastructure implementa interfaces do Domain)
- **Violação de camada é bloqueante em review**: um controller que importa um Repository diretamente viola esta arquitetura
- **Estratégia de testes**: Domain = unitários puros; Application = unitários com mocks de repositório; Infrastructure = testes de integração (Testcontainers)`,

  microservices: `## Microservices Architecture

- **Responsabilidade única e bounded context**: cada serviço encapsula um domínio coeso; nunca acesse o banco de dados de outro serviço
- **Comunicação síncrona (HTTP/gRPC)**:
  - Timeout explícito em toda chamada entre serviços (recomendado: 3s; ajuste por SLA)
  - Circuit breaker obrigatório (Resilience4j / Polly) — falhe rápido, não propague lentidão
  - Retry com backoff exponencial + jitter — máximo de 3 tentativas antes de abrir o circuito
  - Nunca faça chamadas síncronas encadeadas (A → B → C em caminho crítico) — cria acoplamento temporal
- **Comunicação assíncrona (Kafka / SQS / RabbitMQ)**:
  - Preferida para operações sem necessidade de resposta imediata
  - Mensagens devem ser idempotentes: processar a mesma mensagem mais de uma vez não causa efeito colateral
  - DLQ obrigatório — mensagens com falha nunca descartadas silenciosamente
- **Schema de banco de dados**: cada serviço tem seu próprio schema ou banco — sem tabelas compartilhadas
- **Sagas para transações distribuídas**: nunca use 2PC — use Choreography Saga (eventos) ou Orchestration Saga (saga coordinator)
- **Service discovery**: DNS-based (ECS / Kubernetes) — nunca hardcode IPs de serviços
- **Estratégia de testes**: unitários por serviço + contract tests (Pact) entre consumer e provider + testes de integração com Testcontainers Compose para fluxos críticos`,

  monolith: `## Modular Monolith

- Módulos bem delimitados com interfaces explícitas entre si
- Sem dependência circular entre módulos
- Shared kernel mínimo — preferir duplicação a acoplamento`,

  serverless: `## Serverless Architecture

- **Stateless obrigatório**: nenhum estado em memória que diverge entre invocações — todo estado vive em S3, DynamoDB, ElastiCache ou RDS
- **Cold start — minimize o impacto**:
  - Reduza dependências no pacote de deploy — tree shaking; evite SDKs pesados quando há alternativas menores
  - Inicialize conexões de banco/cliente HTTP fora do handler (escopo do módulo) — reutilização entre invocações morna (warm)
  - Provisioned Concurrency para funções em caminho crítico com SLA de latência
- **Timeout e limites**: configure \`timeout\` explicitamente — deve ser menor que o timeout do caller; defina \`memorySize\` com base em benchmark
- **Permissões mínimas (Least Privilege)**: cada função tem sua própria IAM role com apenas as permissões que ela precisa — nunca compartilhe roles entre funções com responsabilidades diferentes
- **Idempotência obrigatória**: event sources (SQS, S3, Kinesis) reentregam mensagens em caso de falha — o handler deve ser idempotente; use \`messageId\` / \`eventId\` para deduplicação com TTL no DynamoDB
- **Observabilidade**: AWS Lambda Powertools (Python/Java/TypeScript) — logging estruturado, tracing X-Ray e métricas em uma linha; \`traceId\` propagado do evento de entrada
- **Estratégia de testes**: unitários do handler com mock do evento de entrada + testes de integração com LocalStack (S3, SQS, DynamoDB)`,
};

export function generateArchPattern(story: Story): string {
  const arch = story.technicalSpec.architecture || 'layered';
  const detail = patterns[arch] ?? patterns['layered'];

  return `---
applyTo: "**"
---
# Architecture Pattern — Padrão Arquitetural

${detail}
`;
}
