import { Story } from '../../story/Story';
import { generateGraphMandateCondensed } from '../baseline/GraphNavigationGenerator';

export function generateHandoffSkill(story?: Story): string {
  const storyId = story?.metadata?.id ?? '<feature-id>';
  const featureRef = story?.metadata?.id
    ? `specs/${storyId}/spec.md, specs/${storyId}/plan.md, specs/${storyId}/tasks.md`
    : 'specs/<feature>/{spec,plan,tasks}.md';

  return `---
name: speckit-handoff
description: "Use when the user invokes /handoff, asks to compact the conversation, signals an upcoming context limit, or needs another agent (fresh session, different model, peer) to resume the SpecKit work without losing fidelity. Produces a structured handoff document anchored on verifiable references (paths, line numbers, commit SHAs), never on narrative recall."
---

# SpecKit Handoff

> Goal: transfer the **state of a SpecKit session** to a fresh agent with **zero
> hallucination tolerance**. Every claim in the handoff must point to a
> verifiable artifact (file path + line, commit SHA, or task id). If you cannot
> anchor it, omit it.

## Quick start

1. Write the document to \`.speckit/handoff/${storyId}-<YYYYMMDD-HHmm>.md\` in the workspace (create the directory if missing). Do **not** save to OS temp — the user wants it discoverable.
2. Use the template in **Document structure** below. Reference artifacts, do not duplicate them.
3. Redact secrets following the credentials rules from \`speckit-baseline/SKILL.md\` (and REFERENCE-credentials.md). When in doubt, omit.

## When this skill applies

- User runs \`/handoff [focus of next session]\` or asks for a session handoff/summary for a fresh agent.
- Conversation is approaching the context budget and you anticipate compaction.
- Work is paused and will be resumed later by another agent, by the same user in a new session, or by a teammate.
- Switching models mid-task (the new model lacks the prior turns).

## REGRA INEGOCIÁVEL — Anti-alucinação no handoff

Cada afirmação de estado no documento **deve** estar ancorada em uma destas formas:

| Tipo de afirmação | Âncora obrigatória |
|---|---|
| "Função X foi modificada" | \`src/<path>.ts:LINHA\` ou commit SHA |
| "Decisão Y foi tomada" | Link para ADR, plan.md#sec, ou turno do chat citado |
| "Teste Z passa" | Caminho do teste + comando que o executou |
| "Endpoint /api/... existe" | Path do controller + linha |
| "Tarefa pendente" | \`tasks.md#T-NN\` |

**Proibido**: parágrafos narrativos genéricos ("trabalhamos em autenticação"),
suposições sobre estado ("provavelmente o teste passa"), referência a arquivos
sem verificar que existem.

Se uma informação for relevante mas não tiver âncora, marque-a como
\`[NÃO VERIFICADO]\` para o próximo agente conferir antes de usar.

## Document structure (use as template)

\`\`\`markdown
# Handoff — STORY/FIX ${storyId}

**Generated**: <YYYY-MM-DD HH:MM> (local)
**Last commit on branch**: <SHA short> "<subject>" (run \`git log -1 --oneline\`)
**Branch**: <name> (run \`git branch --show-current\`)
**Workspace dirty?**: yes/no (run \`git status --short\`)

## Next session focus
<one or two sentences — what the user/agent should accomplish next>

## Re-entry checklist (do this FIRST)
- [ ] Read \`.github/skills/speckit-baseline/SKILL.md\`
- [ ] Read the REFERENCE-*.md files listed in **Suggested skills** below
- [ ] Run \`git status\` and \`git log -5 --oneline\`
- [ ] Open \`${featureRef}\`
- [ ] Read this handoff in full before touching code

## Suggested skills (load these before acting)
<list the skills already active in this session, e.g.:>
- speckit-baseline (always; plus REFERENCE-<area>.md if a non-negotiable applies)
- speckit-stack-<lang> (auto-loaded by language match)
- speckit-context-STORY-${storyId} or speckit-fix-context
- corp-* (only those that matched the current stack — list explicitly)

## Verified state
<bullet list, each item with anchor>
- Implemented: <description> — \`src/<path>:LINE\` (commit <SHA>)
- Test added: \`tests/<path>\` — last run: \`npm test -- <pattern>\` (exit 0)
- Refactor: <description> — diff in commit <SHA>

## Open work (with anchors)
- [ ] <task> — \`tasks.md#T-NN\` (status: pending)
- [ ] <task> — \`tasks.md#T-NN\` (status: in_progress; blocked on <reason>)

## Decisions made this session
- <decision> — rationale → see \`plan.md#section\` or chat turn
- <decision> — alternatives rejected: <why>, anchored to <ref>

## Open questions for next session
- <question> — context: <where it came from>
- <question> — needs answer from: <user / docs / spike>

## Known risks / unverified claims
- [NÃO VERIFICADO] <claim> — needs check before acting

## Do NOT
- <list of things the next agent should avoid; reference baseline rules when applicable>
- Never re-do decisions in **Decisions made this session** without explicit user re-approval
\`\`\`

## Redaction rules (mandatory)

Before saving the file:

- Remove or mask anything that looks like a secret (API key, token, password,
  private key, connection string, JWT). When unsure, omit.
- Remove PII (emails of end users, full names of customers, document IDs, phone
  numbers). Internal team handles are OK.
- Replace database/host names of production environments with role descriptors
  ("prod-db", "staging-cache") unless they are already public in the repo.
- The handoff file is treated as a working artifact, not a secret store.

## What this skill does **not** do

- Does not modify \`spec.md\`, \`plan.md\`, \`tasks.md\` — those are the source of truth, referenced here.
- Does not run \`/specify\`, \`/plan\`, \`/tasks\`, \`/implement\`, or \`/review-auto\` automatically.
- Does not commit the handoff file (the user decides).
- Does not replace the SpecKit session state managed by the host (Copilot CLI checkpoints, VS Code state). It complements them.

## Re-entry hint for the receiving agent

When you (the next agent) open a handoff file, your first response should be:

1. Confirm you read the handoff and the suggested skills.
2. Re-state the next-session focus in one sentence.
3. List the first 1–3 concrete actions you will take, each anchored to a file/task.
4. Ask the user only the open questions that block step 3.

---

${generateGraphMandateCondensed()}
`;
}
