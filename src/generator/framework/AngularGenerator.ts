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
`;
}
