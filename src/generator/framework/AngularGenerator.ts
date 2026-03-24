export function generateAngular(): string {
  return `---
applyTo: "**/*.ts,**/*.html"
---
# Angular — Boas Práticas

## Componentes
- Use \`ChangeDetectionStrategy.OnPush\` em todos os componentes
- Smart components gerenciam estado; dumb components apenas recebem @Input
- Use **Angular Signals** para estado local de componente
- Prefira \`async\` pipe no template — evite \`subscribe()\` em componentes

## Estado e RxJS
- Estado compartilhado em Services com \`BehaviorSubject\` ou NgRx
- Use RxJS operators (switchMap, debounceTime, takeUntilDestroyed) para streams
- Cancele subscriptions com \`takeUntilDestroyed()\` ou \`DestroyRef\`

## Performance
- Lazy loading obrigatório para feature modules
- \`TrackBy\` em todos os \`*ngFor\`
- Evite lógica pesada em templates — use pipes puros

## HTTP & Roteamento
- **HTTP Interceptors**: injeção de token, tratamento global de erros, estado de loading via cadeia de interceptors
- **Route Guards**: \`CanActivate\` para portais de autenticação, \`CanDeactivate\` para aviso de alterações não salvas
- Reactive Forms com \`FormBuilder\`; adicione validators na definição; exponha erros via template binding
- \`environment.ts\` / \`environment.prod.ts\`: todas as URLs base de API e feature flags — nunca inline em services
- Trate erros HTTP globalmente no interceptor; exponha mensagens ao usuário via serviço de notificação

## Integração com BFF
- Todas as chamadas de API usam prefixo \`/api/*\` — nunca URLs diretas de microsserviços no código Angular
- Autenticação gerenciada pelo BFF (session cookie ou token relay); Angular não armazena nem gerencia tokens
- Angular recebe erros normalizados em RFC 7807 independente de qual serviço downstream falhou
- Não configure CORS no Angular — CORS é responsabilidade do BFF ou do backend
`;
}
