export function generateAngular(): string {
  return `---
applyTo: "**/*.ts,**/*.html"
---
# Angular — Boas Práticas

## Componentes
- Use \`ChangeDetectionStrategy.OnPush\` em todos os componentes
- Smart components gerenciam estado; dumb components apenas recebem inputs
- Use **Angular Signals** para estado local de componente
- Prefira \`async\` pipe no template — evite \`subscribe()\` em componentes
- Angular 17+: use a nova sintaxe de **\`input()\`** / **\`output()\`** / **\`viewChild()\`** como funções em vez dos decorators \`@Input\`/\`@Output\`/\`@ViewChild\` — mais type-safe e integrados com Signals

## Angular 19 — Recursos modernos
- **Zoneless Change Detection**: configure com \`provideExperimentalZonelessChangeDetection()\` em \`app.config.ts\` para eliminar Zone.js — requer que a detecção de mudanças seja disparada via Signals ou \`markForCheck()\`; performance significativamente superior em apps grandes
- **\`linkedSignal()\`**: signal derivado que pode ser sobrescrito manualmente — substitui o padrão \`computed + signal de override\`; use quando o valor inicial é derivado mas o usuário pode alterá-lo
- **\`resource()\`**: API para data fetching reativa integrada com Signals — declara a fonte de dados e o loader; o status (\`isLoading\`, \`error\`, \`value\`) é exposto como signals; elimina boilerplate de \`effect + isLoading + error\`

## Estado e RxJS
- Estado compartilhado em Services com \`BehaviorSubject\` / \`signal()\` ou NgRx Signals Store
- Use RxJS operators (switchMap, debounceTime, takeUntilDestroyed) para streams baseados em eventos
- Cancele subscriptions com \`takeUntilDestroyed()\` ou \`DestroyRef\`
- Prefira Signals para estado simples; reserve RxJS para streams de eventos complexos ou combinações multi-source

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
