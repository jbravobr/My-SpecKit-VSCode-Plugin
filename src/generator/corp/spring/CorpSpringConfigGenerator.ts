export function generateCorpSpringConfig(): string {
  return `---
name: corp-spring-config
description: "Corp padrões para configuração e beans em Spring (@Configuration, @Bean, @ConfigurationProperties). Use quando definir beans, propriedades externalizadas ou wiring de dependências em Java/Spring."
applyTo: "**/*.java"
---
# Corp · Spring Configuration & Beans

## @Configuration / @Bean
- Classes \`@Configuration\` devem ser pequenas e coesas — uma por contexto técnico (data, web, messaging, security).
- Métodos \`@Bean\` retornam interfaces, não implementações concretas, quando possível.
- Não use \`@ComponentScan\` aberto sem necessidade — prefira pacotes explícitos.

## @ConfigurationProperties
- Externalize toda configuração em \`@ConfigurationProperties(prefix="app.<dominio>")\` com validação \`@Validated\` + \`jakarta.validation\`.
- Use **records** ou classes imutáveis com construtor — sem setters.
- Registre via \`@EnableConfigurationProperties\` ou \`@ConfigurationPropertiesScan\`.

## Perfis
- \`application.yml\` base + \`application-<profile>.yml\` por ambiente — sem hardcode.
- Secrets nunca em YAML versionado — venham de Secrets Manager / Vault / env.

## Conditional Beans
- Use \`@ConditionalOnProperty\`, \`@ConditionalOnMissingBean\` para auto-config seguro.
- Documente o contrato de ativação no Javadoc da \`@Configuration\`.
`;
}
