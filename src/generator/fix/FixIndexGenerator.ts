import { Fix, TechStackDetection } from '../../fix/Fix';

export function generateFixIndex(
  fix: Fix,
  stack: TechStackDetection,
  contextSkillName = 'speckit-fix-context',
): string {
  return `# SpecKit — Fix ${fix.metadata.id}: ${fix.metadata.title || '(sem título)'}

## Tipo: Bug Fix

**Severidade:** ${fix.impactAssessment.severity?.toUpperCase() || 'NÃO DEFINIDA'}
**Stack detectada:** ${stack.language} / ${stack.framework}${stack.architecture ? ` / ${stack.architecture}` : ''} (fonte: \`${stack.source}\`)

## Objetivo

Corrigir o bug descrito em \`.speckit/FIX-${fix.metadata.id}.md\`.

- A root cause deve ser confirmada **antes** de qualquer mudança de código
- Escopo estritamente limitado ao bug — zero mudanças fora do escopo
- Testes de regressão são obrigatórios

## Skills (carregados sob demanda)
- \`skills/speckit-baseline\` — padrões de engenharia, testes, segurança, git
- \`skills/speckit-stack\` — convenções de ${stack.language}/${stack.framework}
- \`skills/${contextSkillName}\` — contexto do bug, root cause, impacto, regressão

## Agents (selecione no dropdown)
- **speckit-fix-implementador** — Sessão A: investigação → correção → testes (Gates 0–2)
- **speckit-fix-revisor** — Sessão B: revisão independente → entrega (Gates 3–4)
`;
}
