import { Fix, FixGap, TechStackDetection } from '../../fix/Fix';

const TEST_COMMANDS: Record<string, string> = {
  typescript: 'npx vitest run --coverage --coverage.thresholds.lines=80',
  javascript: 'npx vitest run --coverage --coverage.thresholds.lines=80',
  java: './mvnw verify -Djacoco.haltOnFailure=true -Djacoco.minimum.coverage=0.80',
  csharp: 'dotnet test --collect:"XPlat Code Coverage" /p:CoverageThreshold=80',
  python: 'pytest --cov=src --cov-fail-under=80 --cov-report=term-missing',
};

function testCommandForStack(language: string): string {
  return TEST_COMMANDS[language] ?? TEST_COMMANDS['typescript'];
}

export function generateFixImplementPrompt(fix: Fix, stack: TechStackDetection): string {
  const fixId = fix.metadata.id || '001';
  const dofList =
    fix.dof.criteria.map((c) => `- [ ] ${c}`).join('\n') || '- [ ] (não especificado)';

  return `# Fix Implement — Sessão A (Gates 0–2)

Fix: **${fix.metadata.title || fixId}** | ID: ${fixId}
Stack detectada: ${stack.language} / ${stack.framework}${stack.architecture ? ` / ${stack.architecture}` : ''}

> Esta sessão cobre: confirmação da root cause → implementação → testes de regressão.
> Ao concluir o Gate 2 com 0 falhas e cobertura ≥ 80%, você receberá
> instruções para iniciar a revisão independente.

---

## Gate 0 — Investigação e Confirmação

### 0.1 Leia o fix
Leia \`.speckit/FIX-${fixId}.md\` na íntegra antes de qualquer outra ação.

### 0.2 Inspecione os arquivos suspeitos
Para cada arquivo/componente listado em "Arquivos/Componentes Suspeitos":
\`\`\`bash
git log --follow -p <arquivo>
git blame <arquivo>
\`\`\`

### 0.3 Confirme a root cause
Com base na leitura e inspeção:
1. **Confirme ou revise** a hipótese de root cause
2. **Apresente ao usuário**: root cause confirmada + arquivos que serão modificados + escopo exato da mudança
3. **Aguarde confirmação explícita** antes de escrever qualquer código

> Aceite: "confirmar", "pode ir", "sim", "s", "ok" ou equivalente.
> Se a root cause não for confirmável: pergunte ao usuário antes de prosseguir.

**Não avance para o Gate 1 sem:**
- [ ] Root cause confirmada e aceita pelo usuário
- [ ] Escopo da mudança delimitado

---

## Gate 1 — Implementação

### Setup git
\`\`\`bash
git checkout develop && git pull
git checkout -b fix/${fixId}-<slug>
\`\`\`

### Regras de implementação
- Corrija **apenas** o que causa o bug — nenhuma refatoração ou melhoria além do escopo
- Stack: ${stack.language} / ${stack.framework} (ver \`instructions/\` para convenções)
- Mudanças cirúrgicas: prefira alterar o mínimo de linhas necessário
- Se a correção exigir mudanças em múltiplos locais, liste cada local antes de modificar

### Commit de implementação
\`\`\`bash
git add <arquivos específicos do fix>
git commit -m "fix(${fixId}): <descrição da correção>"
\`\`\`

**Não avance para o Gate 2 sem:**
- [ ] Fix implementado e compilando
- [ ] Testes existentes não quebrados

---

## Gate 2 — Testes de Regressão

### Cobertura obrigatória
- **Mínimo: 80%** nas linhas modificadas
- O cenário que causou o bug deve ter um teste explícito

### Testes obrigatórios
1. **Teste de regressão principal** — o cenário exato que causava o bug deve falhar sem o fix e passar com o fix
2. **Edge cases** da área modificada — null, empty, limites
3. **Error cases** — respostas inesperadas de dependências

### Estrutura (AAA)
\`\`\`
// Arrange — configure o estado que causava o bug
// Act    — execute a operação que falhava
// Assert — verifique que agora funciona corretamente
\`\`\`

### Commit de testes
\`\`\`bash
git add <arquivos de teste>
git commit -m "test(${fixId}): regressão — <descrição>"
\`\`\`

**Não avance sem:**
- [ ] 0 (zero) falhas
- [ ] Cobertura ≥ 80% (relatório apresentado)

---

## DoF

${dofList}

---

## Sessão A concluída

Gates 0–2 completos. **Encerre esta sessão.**

Para iniciar a revisão independente, o usuário deve abrir um novo Copilot Chat em modo Agente e digitar \`/fix-review\`.

Não faça mais alterações de código nesta sessão.
`;
}

export function generateFixReviewPrompt(fix: Fix, stack: TechStackDetection): string {
  const fixId = fix.metadata.id || '001';
  const dofList =
    fix.dof.criteria.map((c) => `- [ ] ${c}`).join('\n') || '- [ ] (não especificado)';

  return `# Fix Review — Sessão B (Gates 3–4)

Fix: **${fix.metadata.title || fixId}** | ID: ${fixId}
Stack detectada: ${stack.language} / ${stack.framework}${stack.architecture ? ` / ${stack.architecture}` : ''}

> Você é um revisor independente. Não participou da implementação.
> Avalie apenas o que está no código — não presuma intenções.

---

## Contexto de entrada — leitura obrigatória

1. Leia \`.speckit/FIX-${fixId}.md\` na íntegra
2. Liste os arquivos modificados:
   \`\`\`bash
   git diff develop...HEAD --name-only
   \`\`\`
3. Leia cada arquivo modificado
4. Solicite ao usuário o relatório de cobertura da Sessão A

Só inicie o checklist após concluir os 4 passos acima.

---

## Gate 3 — Revisão

### Bug Fix Verification
- [ ] O cenário dos "Passos para Reproduzir" não ocorre mais após o fix
- [ ] A root cause foi endereçada (não apenas o sintoma)
- [ ] Nenhuma mudança fora do escopo do bug

### Código
- [ ] Segue convenções de **${stack.language}** (ver \`instructions/lang-*\`)
- [ ] Mudanças cirúrgicas — sem refatoração desnecessária
- [ ] Sem código morto ou debug statements

### Testes
- [ ] Teste de regressão principal presente e passando
- [ ] 0 (zero) falhas (evidência: relatório da Sessão A)
- [ ] Cobertura ≥ 80% nas linhas modificadas
- [ ] Edge cases cobertos

### Git
- [ ] Branch segue padrão \`fix/${fixId}-<slug>\`
- [ ] Commits seguem Conventional Commits
- [ ] Commit de implementação + commit de testes separados

### DoF
${dofList}

### Formato do veredito
1. **Veredito**: APROVADO / ALTERAÇÕES SOLICITADAS
2. **Bloqueantes**: itens que impedem a entrega
3. **Melhorias**: recomendados, não bloqueantes

**Se APROVADO:** avance para o Gate 4.

**Se ALTERAÇÕES SOLICITADAS:**
Liste bloqueantes, corrija cada um com commit atômico:
\`\`\`bash
git commit -m "fix(${fixId}): correção pós-revisão — <descrição>"
\`\`\`
Reexecute o checklist do Gate 3 completo após todas as correções.

---

## Gate 4 — Entrega

### Passo 1 — Rebase
\`\`\`bash
git fetch origin
git rebase origin/develop
\`\`\`

### Passo 2 — Reexecute os testes
\`\`\`bash
${testCommandForStack(stack.language)}
\`\`\`

- [ ] 0 (zero) falhas
- [ ] Cobertura ≥ 80%

### Passo 3 — Valide o DoF
${dofList}

### Passo 4 — Encerramento do Fix
\`\`\`bash
git status
\`\`\`

Se há arquivos pendentes:
\`\`\`bash
git add <arquivos pendentes>
git commit -m "fix(${fixId}): encerramento pós-revisão"
\`\`\`

Após o commit, atualize o status do fix para encerrado:
Abra \`.speckit/FIX-${fixId}.md\` e substitua \`status: open\` por \`status: done\` no bloco \`<!-- metadata -->\`.
\`\`\`bash
git add .speckit/FIX-${fixId}.md
git commit -m "chore(${fixId}): encerra fix no speckit"
\`\`\`

---

## Declaração de conclusão

> **Fix ${fixId} CONCLUÍDO.** Bug não reproduz. Testes: 100% passando. Cobertura: X%.
> Commit local na branch \`fix/${fixId}-<slug>\`.
`;
}

export function generateFixRunPrompt(fix: Fix, stack: TechStackDetection): string {
  const fixId = fix.metadata.id || '001';
  const dofList =
    fix.dof.criteria.map((c) => `- [ ] ${c}`).join('\n') || '- [ ] (não especificado)';

  return `# Fix Run — Modo Monolítico

Fix: **${fix.metadata.title || fixId}** | ID: ${fixId}
Stack detectada: ${stack.language} / ${stack.framework}${stack.architecture ? ` / ${stack.architecture}` : ''}

> **MODO MONOLÍTICO** — todos os gates em uma única sessão.
> Recomendado para: bugs simples de causa evidente.
> Para bugs complexos: use \`/validate\` + sessão de review independente.

---

## Gate 0 — Investigação

Leia \`.speckit/FIX-${fixId}.md\` e inspecione os arquivos suspeitos.
Confirme root cause antes de escrever qualquer código.
Aguarde confirmação do usuário.

---

## Gate 1 — Implementação

Setup git:
\`\`\`bash
git checkout -b fix/${fixId}-<slug>
\`\`\`

Corrija apenas o bug, nada além. Commit ao concluir:
\`\`\`bash
git commit -m "fix(${fixId}): <descrição>"
\`\`\`

---

## Gate 2 — Testes

Escreva teste de regressão principal + edge cases. Cobertura ≥ 80%.
\`\`\`bash
git commit -m "test(${fixId}): regressão"
\`\`\`

---

## Gate 3 — Revisão

### Bug Fix Verification
- [ ] O cenário dos "Passos para Reproduzir" não ocorre mais após o fix
- [ ] A root cause foi endereçada — não apenas o sintoma
- [ ] Nenhuma mudança fora do escopo do bug

### Código
- [ ] Segue convenções de **${stack.language}** (ver \`instructions/lang-*\`)
- [ ] Mudanças cirúrgicas — sem refatoração desnecessária
- [ ] Sem código morto, debug statements ou comentários temporários

### Testes
- [ ] Teste de regressão principal presente e passando
- [ ] 0 (zero) falhas — execute o runner antes de marcar
- [ ] Cobertura ≥ 80% nas linhas modificadas

### Segurança (verifique se o bug estava relacionado a)
- [ ] Credencial exposta em log ou resposta — confirmado ausente após o fix
- [ ] Input não sanitizado — validação adicionada se necessário
- [ ] Dados sensíveis expostos em mensagem de erro — corrigido

### DoF
${dofList}

**Não avance para o Gate 4 sem todos os itens acima verificados.**

---

## Gate 4 — Entrega

Rebase, reteste, valide DoF, commit de encerramento.
Atualize \`status: done\` em \`.speckit/FIX-${fixId}.md\`.

### DoF
${dofList}

---

> **Fix ${fixId} CONCLUÍDO.** Bug não reproduz. Cobertura: X%.
`;
}

export function generateFixGapFillingPrompt(fix: Fix, gaps: FixGap[]): string {
  const fixId = fix.metadata.id || '001';
  const gapList = gaps.map((g) => `- **[${g.section}]** \`${g.field}\`: ${g.message}`).join('\n');

  return `# Fix Alignment — Preenchimento de Lacunas

Fix: **${fix.metadata.title || fixId}** | ID: ${fixId}
Arquivo: \`.speckit/FIX-${fixId}.md\`

## Lacunas identificadas (${gaps.length})

${gapList}

---

## Instruções para o agente

Conduza uma conversa estruturada para preencher cada lacuna acima:

1. **Apresente a primeira lacuna** como pergunta objetiva e direta ao usuário
2. **Aguarde a resposta**
3. **Atualize o arquivo** \`.speckit/FIX-${fixId}.md\` com a resposta recebida
4. **Prossiga para a próxima lacuna** — uma por vez, sem agrupamentos
5. **Repita** até que não reste nenhuma lacuna

### Regras
- Uma pergunta por vez — nunca agrupe múltiplas lacunas
- Nunca invente ou assuma uma resposta
- Atualize o arquivo imediatamente após cada resposta

---

## Após todas as lacunas resolvidas

> Todas as lacunas foram preenchidas. Execute \`@speckit /validate\` para gerar os arquivos de configuração e iniciar a correção.
`;
}
