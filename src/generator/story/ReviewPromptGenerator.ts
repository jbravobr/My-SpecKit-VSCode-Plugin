import { Story } from '../../story/Story';

export function generateReviewPrompt(story: Story): string {
  const storyId = story.metadata.id || '001';
  const criteria = story.functionalSpec.acceptanceCriteria.map((c) => `- [ ] ${c}`).join('\n');
  const dodList = story.dod.criteria.map((c) => `- [ ] ${c}`).join('\n');
  const hasKafka = (story.technicalSpec.infrastructure ?? '').toLowerCase().includes('kafka');
  const performanceCheck = hasKafka
    ? 'Throughput / consumer lag (P99 não se aplica a consumers async — usar SLO de lag)'
    : story.nonFunctionalSpec.performance?.trim() || 'P99 < 500ms (baseline padrão)';
  const scalabilityLine = story.nonFunctionalSpec.scalability?.trim()
    ? `\n- [ ] Escalabilidade (código): ${story.nonFunctionalSpec.scalability.trim()}`
    : '';

  return `# Review Story — Sessão B (Gates 3–4)

Story: **${story.metadata.title || storyId}** | ID: ${storyId}
Stack: ${story.technicalSpec.language} / ${story.technicalSpec.framework} / ${story.technicalSpec.architecture}

> Você é um revisor independente. Não participou da implementação.
> Não presuma nada sobre as decisões tomadas — avalie apenas o que está no código.

---

## Contexto de entrada — leitura obrigatória

Antes de iniciar qualquer avaliação:

1. Leia \`.speckit/STORY-${storyId}.md\` na íntegra
2. Liste os arquivos da feature:
   \`\`\`bash
   git diff develop...HEAD --name-only
   \`\`\`
3. Leia cada arquivo modificado
4. Solicite ao usuário que cole o relatório de cobertura da Sessão A

Só inicie o checklist após concluir os 4 passos acima.

**Regra do revisor independente:** ao encontrar uma decisão questionável, pergunte a razão ao usuário antes de marcar como bloqueante — não assuma que foi intencional ou que foi erro.

---

## Gate 3 — Revisão

### Funcionalidade
${criteria || '- [ ] (critérios não especificados)'}

### Arquitetura (${story.technicalSpec.architecture})
- [ ] Direção de dependências respeitada
- [ ] Sem imports de infraestrutura no domínio
- [ ] Responsabilidades bem separadas por camada

### Qualidade de código
- [ ] Segue convenções de **${story.technicalSpec.language}** (ver \`instructions/lang-*\`)
- [ ] Segue convenções de **${story.technicalSpec.framework}** (ver \`instructions/fw-*\`)
- [ ] Sem código morto ou comentado sem justificativa

### Testes
- [ ] 0 (zero) falhas (evidência: relatório da Sessão A)
- [ ] Cobertura ≥ 80% (relatório obrigatório)
- [ ] Happy path coberto para cada critério de aceite
- [ ] Edge cases cobertos (null, vazio, limites)
- [ ] Error cases cobertos (not found, inválido, permissão)
- [ ] Sem testes ignorados sem justificativa

### Testes de Segurança
- [ ] Toda rota protegida testada sem token: retorna \`401\`
- [ ] Toda rota protegida testada com papel insuficiente: retorna \`403\`
- [ ] Input inválido / malicioso não retorna \`500\` — retorna \`400\` com ProblemDetail
- [ ] Mensagem de erro não expõe stack trace, query SQL ou dados internos ao cliente
- [ ] Campos sensíveis (token, senha, chave) ausentes nos DTOs de resposta e nos logs

### Observabilidade
- [ ] Endpoint de health check presente e respondendo sem autenticação
- [ ] Logs estruturados com \`traceId\` / \`requestId\` em todas as operações
- [ ] \`traceId\` propagado para respostas de erro (campo \`traceId\` no ProblemDetail)
- [ ] Nenhum dado sensível nos logs (senha, token, PII não auditável)

### Requisitos não-funcionais
- [ ] Performance: ${performanceCheck}
- [ ] Segurança: ${story.nonFunctionalSpec.security || '(não especificado)'}${scalabilityLine}
- [ ] Idempotência: operações de escrita não duplicam estado — Idempotency-Key ou deduplicação por chave de negócio presente

### Git
- [ ] Branch segue padrão \`feature/${storyId}-<slug>\`
- [ ] Commits seguem Conventional Commits
- [ ] Sem commits com mensagem genérica ("fix", "wip", "test")
- [ ] Nenhum commit direto em \`develop\` ou \`main\`

### DoD
${dodList || '- [ ] (não especificado)'}

### Formato do veredito
1. **Veredito**: APROVADO / ALTERAÇÕES SOLICITADAS
2. **Bloqueantes**: itens que impedem a entrega (falha funcional, teste falhando, cobertura < 80%)
3. **Melhorias**: recomendados mas não bloqueantes
4. **Sugestões fora de escopo**: registre, não implemente

**Se veredito for APROVADO:** avance diretamente para o Gate 4.

**Se veredito for ALTERAÇÕES SOLICITADAS:**

### Planejamento das tarefas de correção (faça ANTES de escrever qualquer fix)

Liste os bloqueantes e converta cada um em uma tarefa atômica de correção. Cada tarefa deve:
- Corrigir exatamente um bloqueante identificado no veredito
- Ser completa em si mesma (compila, testes existentes não quebram)
- Resultar em um commit convencional ao ser concluída

Formato obrigatório:
\`\`\`
[ ] FIX-1: <bloqueante corrigido> — <arquivos previstos>
[ ] FIX-2: ...
\`\`\`

### Commit por tarefa de correção
Ao concluir cada FIX:
\`\`\`bash
git add <arquivos específicos do fix>
git commit -m "fix(${storyId}): FIX-N — <descrição>"
\`\`\`

Só avance para o próximo FIX após o commit ser concluído sem erros.

### Revalidação após todos os fixes
Execute os testes e reexecute o checklist do Gate 3 completo:
\`\`\`bash
<runner da stack>
\`\`\`
Só avance para o Gate 4 após novo veredito: APROVADO.

---

## Gate 4 — Entrega

### Passo 1 — Sincronize com develop (rebase)
\`\`\`bash
git fetch origin
git rebase origin/develop
\`\`\`

Se houver conflitos: resolva-os, execute \`git rebase --continue\`.
Não use \`git rebase --skip\` sem confirmar que o conflito foi intencionalmente descartado.

### Passo 2 — Reexecute os testes (evidência final obrigatória)
\`\`\`bash
npm test -- --coverage
./mvnw test
dotnet test --collect:"XPlat Code Coverage"
pytest --cov=. --cov-report=term-missing
\`\`\`

Critérios:
- [ ] 0 (zero) testes falhando
- [ ] Cobertura ≥ 80% (apresente o relatório completo)

Se qualquer item falhar: corrija, faça commit atômico e reexecute. Não avance.

### Passo 3 — Valide o DoD
${dodList || '- [ ] (critérios não definidos na story)'}

Todos os itens devem estar marcados antes de prosseguir.

### Passo 3.5 — Prod Readiness
- [ ] Health check endpoint acessível sem autenticação e respondendo \`200\`
- [ ] Nenhuma credencial hardcoded ou em variável de ambiente definida manualmente no código
- [ ] Logs estruturados com \`traceId\` — verificado com execução local
- [ ] Sem dados sensíveis em mensagens de log: grep por \`password\`, \`secret\`, \`token\` nos logs de startup
- [ ] Sem \`System.out.println\`, \`console.log\`, \`print()\` de debug remanescentes em produção

### Passo 4 — Commit de fechamento (somente se houver arquivos pendentes)
\`\`\`bash
git status
\`\`\`

Se o veredito foi APROVADO de imediato (sem correções no Gate 3), comite a implementação:
\`\`\`bash
git add <arquivos específicos da story>
git commit -m "feat(${storyId}): <descrição do que foi implementado>"
\`\`\`

Se correções foram feitas no Gate 3, os commits \`fix(${storyId}): FIX-N\` já foram realizados.
Só faça um commit adicional se \`git status\` mostrar arquivos ainda não comitados:
\`\`\`bash
git add <arquivos pendentes>
git commit -m "fix(${storyId}): ajustes pós-revisão"
\`\`\`

### Passo 5 — Encerramento da story no SpecKit
Após o commit de entrega, marque a story como concluída:
Abra \`.speckit/STORY-${storyId}.md\` e substitua \`status: open\` por \`status: done\` no bloco \`<!-- metadata -->\`.
\`\`\`bash
git add .speckit/STORY-${storyId}.md
git commit -m "chore(${storyId}): encerra story no speckit"
\`\`\`

---

## Declaração de conclusão

Somente após todos os gates concluídos com sucesso, emita:

> **Story ${storyId} CONCLUÍDA.** Testes: 100% passando. Cobertura: X%.
> Commit local na branch \`feature/${storyId}-<slug>\`.
`;
}

// @deprecated — conteúdo absorvido por generateReviewPrompt (PORTÃO 4)
export function generateFinalizePrompt(story: Story): string {
  const dod = story.dod.criteria.map((c) => `- [ ] ${c}`).join('\n');
  return `# Finalize Story — Portão de Entrega

Story: **${story.metadata.title || story.metadata.id}**

> Este prompt só deve ser executado quando a implementação e os testes estiverem completos.
> O agente só pode declarar a story como CONCLUÍDA após validar TODOS os itens abaixo.

---

## Passo 1 — Execute os testes e apresente o resultado

\`\`\`bash
# Adapte ao runner da stack
npm test -- --coverage
./mvnw test
dotnet test --collect:"XPlat Code Coverage"
pytest --cov=. --cov-report=term-missing
\`\`\`

**Critérios de aprovação obrigatórios:**
- [ ] 0 (zero) testes falhando
- [ ] Cobertura ≥ 80% (apresente o relatório completo)

Se qualquer item acima falhar: **pare aqui**, corrija e reexecute. Não avance.

---

## Passo 2 — Valide o DoD

${dod || '- [ ] (critérios não definidos na story)'}

Todos os itens acima devem estar marcados antes de prosseguir.

---

## Passo 3 — Commit local

\`\`\`bash
# Garanta que está na branch correta
git status

# Stage somente os arquivos da story
git add <arquivos específicos>

# Commit seguindo Conventional Commits
git commit -m "feat(${story.metadata.id}): <descrição do que foi implementado>"
\`\`\`

---

## Declaração de conclusão

O agente só pode emitir a frase abaixo após todos os passos acima concluídos com sucesso:

> **Story ${story.metadata.id} CONCLUÍDA.** Testes: 100% passando. Cobertura: X%. Commit local na branch \`feature/${story.metadata.id}-<slug>\`.
`;
}
