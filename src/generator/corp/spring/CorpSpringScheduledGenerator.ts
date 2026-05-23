export function generateCorpSpringScheduled(): string {
  return `---
name: corp-spring-scheduled
description: "Corp padrões para tarefas agendadas em Spring (@Scheduled + ShedLock para cluster). Use quando implementar jobs, cron, schedulers ou tarefas periódicas em projetos Java/Spring."
applyTo: "**/*.java"
---
# Corp · Spring Scheduled Tasks

## @Scheduled
- Habilite com \`@EnableScheduling\` em uma única classe de configuração.
- Prefira \`fixedDelayString\`, \`fixedRateString\` ou \`cron\` parametrizados via \`@Value\` ou \`@ConfigurationProperties\` — nunca hardcode.
- Configure um \`TaskScheduler\` (pool dedicado) — não dependa do single-threaded default em produção.

## Execução em cluster (ShedLock)
- Use **ShedLock** para garantir execução única por janela em ambientes multi-instância.
- Anote o método com \`@SchedulerLock(name="...", lockAtMostFor=..., lockAtLeastFor=...)\` — nome único por job.
- LockProvider persistente (JDBC, Mongo, Redis) — nunca in-memory em produção.

## Boas práticas
- Tarefas idempotentes: assuma execução duplicada e proteja com chave de idempotência.
- Logue \`traceId\`/MDC no início do job; meça duração via Micrometer \`Timer\`.
- Não bloqueie a thread pool com I/O longo sem timeout — defina \`@Timed\` e timeouts explícitos.
`;
}
