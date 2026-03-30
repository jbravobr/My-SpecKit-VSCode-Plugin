export function generateReact(): string {
  return `---
applyTo: "**/*.tsx,**/*.ts,**/*.jsx,**/*.js"
---
# React — Boas Práticas

## Componentes
- Componentes funcionais sempre — sem class components
- Um componente por arquivo; nome do arquivo igual ao do componente (PascalCase)
- Smart components gerenciam estado e efeitos; dumb components recebem apenas props
- Props tipadas com \`interface\` — nunca use \`any\` em props

## Estado e efeitos
- \`useState\` para estado local simples
- \`useReducer\` quando o estado tem múltiplas sub-valores ou transições complexas
- \`useContext\` + \`useReducer\` para estado global leve; Zustand ou Redux Toolkit para estado complexo
- \`useEffect\` apenas para sincronizar com sistemas externos — nunca para derivar estado
- Toda função criada dentro de componente que é passada como prop: envolva com \`useCallback\`
- Todo valor computado custoso: envolva com \`useMemo\`

## React 19 — APIs modernas
- **Actions**: mutações assíncronas via \`useActionState(action, initialState)\` — substitui o padrão manual de \`useState\` para loading/error em submissões
- **\`useFormStatus\`**: leia \`pending\` dentro de componentes filho de um form sem prop drilling — desabilite o botão de submit enquanto o action processa
- **\`useOptimistic\`**: atualize a UI otimisticamente durante uma mutação assíncrona; o estado reverte automaticamente se a action falhar
- **\`use(promise)\`**: leia uma Promise ou Context dentro de componentes e hooks — integra com Suspense para data fetching sem \`useEffect\`
- **Suspense para data fetching**: envolva componentes que usam \`use(promise)\` com \`<Suspense fallback={...}>\` — não implemente loading state manual quando Suspense é aplicável
- **React Compiler** (opt-in): quando habilitado (\`babel-plugin-react-compiler\`), o compilador insere memoização automaticamente — remova \`useCallback\`/\`useMemo\` redundantes para evitar conflito

## Performance
- \`React.memo\` em dumb components que recebem props estáveis
- Evite criar objetos ou arrays inline em JSX — extraia para fora do componente ou memoize
- Prefira lazy loading com \`React.lazy\` + \`Suspense\` para rotas e componentes pesados
- \`key\` em listas deve ser estável e único — nunca use índice do array como key

## Formulários e validação
- Prefira \`react-hook-form\` para formulários complexos
- Validação de schema com Zod integrado ao \`react-hook-form\`

## Estilo de código
- Evite lógica complexa em JSX — extraia para variáveis ou funções nomeadas
- Sem efeitos colaterais fora de \`useEffect\` ou handlers de evento
`;
}
