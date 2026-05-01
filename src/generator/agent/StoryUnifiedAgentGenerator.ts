import { Story } from '../../story/Story';
import { AGENT_TOOLS_YAML } from './agentTools';
import { generateImplementadorContentForUnified } from './StoryImplementadorAgentGenerator';
import { generateRevisorContent } from './StoryRevisorAgentGenerator';

/**
 * Generates a unified agent file that contains both implementador (Gates 0-2)
 * and revisor (Gates 3-4) protocols in a single `.agent.md`.
 *
 * Used by `/batch --generate` to produce one agent per story.
 * The user opens one chat per story; the agent transitions internally between modes.
 */
export function generateUnifiedAgent(story: Story): string {
  const storyId = story.metadata.id;
  const lang = story.technicalSpec.language || '(não definida)';
  const fw = story.technicalSpec.framework || '(não definido)';
  const arch = story.technicalSpec.architecture || '(não definida)';
  const deps =
    story.metadata.dependsOn.length > 0 ? story.metadata.dependsOn.join(', ') : 'nenhuma';

  return `---
name: speckit-story-${storyId}
description: "Agente SpecKit unificado para story ${storyId}. Gates 0-4: implementação + revisão com ping-pong interno. Stack: ${lang}/${fw}/${arch}."
${AGENT_TOOLS_YAML}
---

# Agente SpecKit — Story ${storyId} (Gates 0–4)

Story: **${story.metadata.title || storyId}** | ID: ${storyId}
Stack: ${lang} / ${fw} / ${arch}
Dependências: ${deps}

> Este agente conduz o ciclo completo: implementação (Gates 0-2) + revisão (Gates 3-4).
> O modo ativo é determinado pelo gate atual da story.
> **NUNCA** pule gates. Siga a ordem: 0 → 1 → 2 → 3 → 4.

---

${generateDependencyProtocol(story)}

---

## MODO IMPLEMENTADOR — Gates 0, 1, 2

${generateImplementadorContentForUnified(story)}

---

${generateTransitionProtocol(storyId)}

---

## MODO REVISOR — Gates 3, 4

${generateRevisorContent(story)}

> **REGRA INVIOLÁVEL DO MODO REVISOR:** Você **NUNCA** implementa código, cria arquivos de produção, faz commits de código ou altera qualquer artefato que não seja documentação de revisão. Se o veredito for ALTERAÇÕES SOLICITADAS, documente os bloqueios e retorne ao MODO IMPLEMENTADOR via protocolo de retorno.

---

${generateReturnProtocol(storyId)}
`;
}

function generateDependencyProtocol(story: Story): string {
  const deps =
    story.metadata.dependsOn.length > 0 ? story.metadata.dependsOn.join(', ') : 'nenhuma';

  return `## PROTOCOLO DE DEPENDÊNCIA (Gate 0 — pré-condição obrigatória)

Dependências declaradas: ${deps}

ANTES de iniciar o Gate 0, execute **obrigatoriamente**:

1. **Fonte única de dependência:** considere **somente** o campo \`depends-on\` no metadata de \`.speckit/STORY-${story.metadata.id}.md\`.
2. **Não inferir dependências:** citações a outras stories/fixes no corpo da story, contexto, user stories, critérios de aceite, fora de escopo ou infraestrutura são apenas informativas e **NÃO** bloqueiam execução.
3. Se não houver dependências declaradas no metadata \`depends-on\`, prossiga ao Gate 0.
4. Para **CADA** dependência declarada no metadata \`depends-on\`:
   - Leia o arquivo \`.speckit/STORY-<dep-id>.md\` ou \`.speckit/<dep-id>.md\`
   - Verifique o campo \`status\` no metadata
   - Se \`status\` ≠ \`done\` → esta story está **BLOQUEADA**
5. Se **BLOQUEADA**:
   - Liste as dependências pendentes com status atual
   - Informe: "⏸️ Esta story não pode ser implementada até que as dependências estejam concluídas."
   - Sugira: "Execute \`@speckit /status\` para monitorar o progresso das dependências."
   - **ENCERRE a sessão. Não prossiga.**
6. Se **TODAS** as dependências canônicas estão \`done\` (ou não há dependências canônicas): prossiga ao Gate 0.`;
}

function generateTransitionProtocol(storyId: string): string {
  return `## PROTOCOLO DE TRANSIÇÃO (Gate 2 → Gate 3)

Ao concluir o Gate 2 com sucesso (0 falhas + cobertura ≥ 80%):

1. **Finalize commit local pendente do Gate 2 (obrigatório):**
   - Execute:
     \`\`\`bash
     git status --porcelain
     \`\`\`
   - Se houver alterações pendentes, execute:
     \`\`\`bash
     git add -A
     git commit -m "test(${storyId}): fechamento do gate 2"
     \`\`\`
   - Se o commit falhar por erro operacional, tente \`@speckit /commit\` sem mensagem.
   - Só peça ação manual ao usuário se as duas tentativas falharem.
2. **Persista a troca de gate no metadata da story (obrigatório):**
   - Edite \`.speckit/STORY-${storyId}.md\`
   - No bloco \`<!-- metadata -->\`, garanta:
     - \`gate: 3\`
     - \`status: review\`
   - Salve o arquivo antes de continuar.
3. Se não conseguir persistir o metadata, **interrompa** e solicite ação do usuário. Não inicie Gate 3 sem essa atualização.
4. Emita no chat o bloco de handoff obrigatório:
   - "✅ Gates 0-2 concluídos"
   - "🔁 Handoff: IMPLEMENTADOR → REVISOR"
   - "🚪 Gate atualizado: 2 → 3"
   - "📌 Status atualizado: in-progress/open → review"
5. **Mude de postura:** A partir deste ponto, você é um **revisor independente**. Desconsidere justificativas que você deu durante a implementação. Avalie apenas: o código final atende à spec?
6. Releia \`.speckit/STORY-${storyId}.md\` do zero.
7. Execute \`git diff develop...HEAD --name-only\` para obter a lista atualizada de arquivos.
8. Leia cada arquivo modificado com olhar crítico de revisão.
9. Execute \`@speckit /review-auto\` para orquestrar a revisão automática e consolidar evidências.
10. **Sem aguardar novo comando do usuário, inicie e conclua o Gate 3 do MODO REVISOR no mesmo fluxo:**
  - Execute todo o checklist do Gate 3 (funcionalidade, arquitetura, qualidade, testes, segurança, observabilidade, NFR, git, DoD)
  - Emita veredito completo (APROVADO ou ALTERAÇÕES SOLICITADAS)
  - Se houver bloqueantes, liste cada item com evidência objetiva (arquivo/critério)
11. **Proibido encerrar a resposta somente com handoff.** O handoff só é válido quando acompanhado da execução efetiva da revisão Gate 3.

> **Aviso:** Não carregue nenhuma premissa da fase de implementação. Avalie como se estivesse lendo o código pela primeira vez.`;
}

function generateReturnProtocol(storyId: string): string {
  return `## PROTOCOLO DE RETORNO (ALTERAÇÕES SOLICITADAS → MODO IMPLEMENTADOR)

Quando o MODO REVISOR emitir veredito **ALTERAÇÕES SOLICITADAS**:

1. **Documente** cada bloqueio como tarefa atômica numerada:
   \`\`\`
   [ ] FIX-1: <descrição do bloqueio> — <arquivo(s) afetado(s)>
   [ ] FIX-2: ...
   \`\`\`
2. Informe ao usuário: "🔄 Retornando ao MODO IMPLEMENTADOR para aplicar N correção(ões)."
3. **Aguarde confirmação** do usuário ("ok", "sim", "confirmar", "pode ir").
4. Entre no **MODO IMPLEMENTADOR**:
   - Aplique **SOMENTE** os fixes listados (não implemente nada novo, não refatore)
   - Para cada fix: \`git commit -m "fix(${storyId}): FIX-N — <descrição>"\`
5. Ao concluir todos os fixes:
   - Execute testes (0 falhas + cobertura ≥80%)
   - Informe: "✅ Correções aplicadas. Retornando ao MODO REVISOR para revalidação."
6. Retorne ao **MODO REVISOR** — re-execute o Gate 3 **desde o início** (releia story + diff fresco).

> Este ciclo se repete até o veredito ser **APROVADO**.`;
}
