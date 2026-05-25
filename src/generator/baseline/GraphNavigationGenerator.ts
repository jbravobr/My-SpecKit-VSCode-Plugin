/**
 * Graph Navigation Imperative — produz o bloco `GRAPH_NAVIGATION_IMPERATIVE`
 * que é injetado ao FINAL do `copilot-instructions.md` (posição checklist-at-END,
 * conforme mitigação de Lost-in-the-Middle do arXiv 2602.20048v1).
 *
 * Também produz o `REFERENCE-graph.md` consultivo e uma versão CONDENSADA para
 * skills/agents secundários (token-efficient, ~80 tokens em vez de ~400).
 *
 * Citações:
 *   - arXiv 2602.20048v1 ("Navigation Paradox" / CodeCompass).
 *   - safishamsi/graphify (modelo mental de confidence tags EXTRACTED/INFERRED/AMBIGUOUS).
 */

/**
 * Versão CONDENSADA do mandato — para skills/agents que não são a baseline
 * principal. Token-efficient (~80 tokens). Referencia o SKILL completo da
 * baseline para detalhes.
 */
export function generateGraphMandateCondensed(): string {
  return `## Navegação Estrutural — Regra Inegociável (resumo)

> Detalhes em \`speckit-baseline/SKILL.md\` (seção "Navegação Estrutural por Grafo")
> e \`REFERENCE-graph.md\`. Base: arXiv 2602.20048v1 (+23 p.p. ACS em G3).

- **Antes** de propor edit em código: consultar grafo 1-hop; preferir \`speckit.graph.query\` quando disponível, senão usar \`.speckit/graph.json\` ou \`speckit.graph.inspect\`.
- **Refactor** de símbolo público/classe-base: listar importers + herdeiros + instanciadores; gravar evidência em \`.speckit/evidence/graph-inspection.json\`.
- **Após** \`apply_patch/edit/create\`: declarar grafo possivelmente stale; usar \`speckit.graph.refreshChanged\` quando disponível ou \`speckit.graph.rebuild\` antes do gate final.
- **Busca semântica ∅** mas grafo trouxe vizinhos: aplicar Veto Protocol (listar blind-spots).
- **Sem consulta?** Declarar e justificar — silêncio = violação.`;
}

export function generateGraphNavigation(): string {
  return `---
applyTo: "**"
---
# Navegação Estrutural por Grafo — Regra Inegociável

> Base teórica: **arXiv 2602.20048v1** ("Navigation Paradox") demonstra que janelas
> de contexto maiores **não eliminam** falhas de localização arquitetural —
> dependências G3 (ocultas: não rankeáveis por keyword/BM25/embedding) só são
> capturadas com **navegação estrutural por grafo**. Ganho medido: **+23 p.p. de
> ACS** em G3 quando o grafo é consultado.
>
> Detalhes consultivos, formato do grafo, comandos disponíveis e exemplos vivem em
> **REFERENCE-graph.md** — leia antes de propor edits que toquem código.

## Ação → Obrigação sobre o grafo

| Ação que vou executar | Obrigação |
|---|---|
| Propor edit em arquivo de código (\`*.{ts,tsx,js,jsx,java,py,cs,mts,cts,mjs,cjs}\`) | Consultar 1-hop via grafo (\`.speckit/graph.json\`) ou \`SpecKit: Inspect Graph Neighbors\`. Listar nós inspecionados no output. |
| Refatorar símbolo público, classe-base, config compartilhada, contrato HTTP/JWT/DB | Consultar grafo + listar **importers, herdeiros e instanciadores** ANTES do diff. Gravar evidência estruturada em \`.speckit/evidence/graph-inspection.json\` (rejeitado em \`/review-auto\` se ausente). |
| Usar apenas grep/semantic search sem consultar o grafo | **Declarar** essa limitação no início da resposta e **justificar**. Resposta sem declaração nem consulta = violação. |
| Após cada \`apply_patch/edit/create\` em arquivo de código | Declarar "grafo possivelmente stale". Se o comando \`speckit.graph.refreshChanged\` estiver disponível no workspace, executá-lo; caso contrário, usar \`speckit.graph.rebuild\` antes do gate final. |
| Ao iniciar sessão de implementação | Verificar se \`.speckit/graph.json\` existe e está compatível com o HEAD; se houver comando \`speckit.graph.ensureFresh\`, executá-lo. |
| Ao terminar feature (gate 3/4) | Reexecutar \`speckit.graph.rebuild\` quando o plugin estiver disponível e registrar o resultado do grafo no output. |
| Se a busca semântica retornou ∅ mas o grafo trouxe vizinhos | Acionar **Veto Protocol** explícito: marcar como blind-spot estrutural, revisar antes de propor edit. |

## Cláusula anti-padrão

Se você consultou o grafo e a vizinhança retornou vazia, **declare**: "Grafo
consultado para X — sem vizinhos 1-hop." Isso é evidência. Silêncio sobre
consulta é tratado como ausência de consulta.

## Suspensão automática (não exige consulta)

- Workspace **greenfield** (sem arquivos de código suportados ainda).
- Linguagem **fora do escopo suportado** (TS, JS, Java, Python, C#).
- Setting \`speckit.graph.enabled=false\`.

Nesses casos, o gate é no-op e o validador estrutural não exige evidência.

## Veto Protocol — quando aplicar

1. Pergunta do usuário toca código.
2. Você usou busca semântica/grep e obteve ∅ ou poucos resultados.
3. Você **deve** consultar o grafo antes de responder: preferir \`speckit.graph.query\` quando disponível; caso contrário, usar \`.speckit/graph.json\` ou \`speckit.graph.inspect\`.
4. Se o grafo trouxer vizinhos: tratar como **blind-spot estrutural**, listar no output, revisar antes de propor edit.
5. Se ambos retornarem ∅: declarar "nenhuma navegação estrutural encontrou vizinhos para X" — não inventar.

## Interop com graphify

Se o workspace tiver \`graphify-out/\`, \`.claude/skills/graphify/\` ou
\`.agents/skills/graphify/\`, **prefira** o grafo do graphify (extração mais
robusta). O grafo local \`.speckit/graph.json\` é fallback.

---

**Resumo cognitivo:** consultar o grafo antes de propor edit não é opcional. É a
diferença entre uma sugestão informada e um chute estrutural que quebra
herdeiros invisíveis.`;
}

/**
 * Conteúdo do REFERENCE-graph.md (consultivo, leitura sob demanda).
 */
export function generateGraphReference(): string {
  return `---
applyTo: "**"
---

> **REFERÊNCIA do speckit-baseline.** Leia antes de executar ações da tabela
> "Ação → Obrigação sobre o grafo" do \`SKILL.md\` (domínio: \`graph\`).

# Navegação Estrutural por Grafo — Referência

## Por quê

**arXiv 2602.20048v1** ("CodeCompass / Navigation Paradox") mediu três classes
de dependências:

- **G1** — visível por keyword/BM25 (nomes idênticos).
- **G2** — semanticamente próxima (embeddings).
- **G3** — **oculta** (mesma arquitetura, nomes diferentes; só visível por grafo).

Resultado-chave: janelas maiores **não** melhoram G3. Consulta de grafo
melhora **+23 p.p. de ACS** em G3 (condição C do paper, tool de grafo invocado).

Achado complementar: **58%** dos agentes ignoram o tool de grafo quando ele é
opcional. Por isso o SpecKit:
1. **Embute o subgrafo da story ativa no \`copilot-instructions.md\`** (lido
   automaticamente pelo Copilot — bloco \`## GRAPH CONTEXT\`).
2. **Posiciona o mandato no FINAL** do arquivo (checklist-at-END mitiga
   Lost-in-the-Middle).

## Formato do grafo (.speckit/graph.json)

\`\`\`jsonc
{
  "schemaVersion": "1.0.0",
  "pluginVersion": "0.7.0",
  "extractorVersions": { "typescript": "1", "python": "1", "java": "1", "csharp": "1" },
  "meta": {
    "headSha": "abc123...",
    "builtAt": "2025-01-15T10:00:00Z",
    "partialLanguages": ["java", "python", "csharp"]
  },
  "nodes": [{ "id": "src/foo.ts", "language": "typescript", "symbols": ["Foo"] }],
  "edges": [{
    "from": "src/foo.ts",
    "to": "src/bar.ts",
    "kind": "IMPORTS",
    "edgeKind": "named",
    "confidence": "EXTRACTED",
    "sourceExtractor": "typescript@1"
  }]
}
\`\`\`

### Confidence tags (alinhadas com graphify)

- \`EXTRACTED\` — aresta encontrada literalmente no código.
- \`INFERRED\` — aresta deduzida por heurística (regex AST-aware).
- \`AMBIGUOUS\` — múltiplas resoluções possíveis. **Trate como sinal fraco**;
  valide antes de confiar.

### Linguagens parciais

Java, Python e C# usam regex AST-aware. Casos quebrados:
- Java: generics complexos, classes aninhadas anônimas.
- Python: imports dinâmicos (\`__import__\`, \`importlib\`).
- C#: partial classes em arquivos múltiplos.

Quando \`partialLanguages\` lista a linguagem do arquivo, **declare a limitação**
no output ao consultar o grafo.

## Comandos disponíveis

### Registrados pela implementação instalada

| Comando | Quando usar |
|---|---|
| \`speckit.graph.rebuild\` | Fim de feature (gate 3/4) ou após operações git destrutivas |
| \`speckit.graph.show\` | Abrir \`.speckit/graph.json\` no editor para auditoria direta |
| \`speckit.graph.inspect\` | Escolher um arquivo indexado e abrir Markdown com até 20 vizinhos |
| \`speckit.graph.installGuardrails\` | Instalar/atualizar esta skill e a referência em espaços de usuário |

### Mandato exposto no contrato, mas dependente de disponibilidade no workspace

| Comando | Como tratar na skill |
|---|---|
| \`speckit.graph.ensureFresh\` | Executar no início da implementação somente se registrado no VS Code ativo; se não estiver disponível, verificar \`.speckit/graph.json\` e HEAD manualmente ou usar \`rebuild\`. |
| \`speckit.graph.refreshChanged\` | Executar após edits em código somente se registrado; se não estiver disponível, declarar grafo possivelmente stale e usar \`rebuild\` antes de concluir. |
| \`speckit.graph.query\` | Preferir para consulta 1-hop quando registrado; se não estiver disponível, usar \`speckit.graph.inspect\` ou leitura direta de \`.speckit/graph.json\`. |

O \`/init\` pode gerar tasks em \`.vscode/tasks.json\` para comandos operacionais do
grafo, como rebuild/show. Não presuma que todo comando listado acima possui task
equivalente: verifique \`.vscode/tasks.json\` antes de invocar por task.

## Exemplos

### ✓ Certo — antes de refatorar \`BaseRepository\`

\`\`\`
Vou refatorar BaseRepository.constructor.
Consultando grafo (speckit.graph.query BaseRepository):
  - Importers: 12 arquivos
  - Herdeiros (INHERITS): UserRepository, OrderRepository, PaymentRepository
  - Instanciadores diretos: none (sempre via herança)

Evidência em .speckit/evidence/graph-inspection.json.
Risco identificado: alterar assinatura quebra 3 herdeiros.
Proposta: adicionar overload retrocompatível, marcar antigo @deprecated.
\`\`\`

### ✗ Errado — refactor sem consultar grafo

\`\`\`
Vou alterar a assinatura de BaseRepository.constructor.

[diff sem listar herdeiros, sem evidência estruturada]
\`\`\`

\`/review-auto\` **rejeita** este output: violação da regra "Refatorar símbolo
público" — falta evidência estruturada.

### ✓ Certo — busca semântica vazia, grafo trouxe nada

\`\`\`
Pergunta: "onde está a lógica de retry do Kafka producer?"
Busca semântica em retry/kafka → ∅
Consultei grafo (speckit.graph.query kafka.producer) — sem vizinhos 1-hop
relacionados a retry.
Conclusão: provavelmente não há lógica de retry implementada. Sugiro
adicionar (mas não vou inventar afirmando que existe).
\`\`\`

## Veto Protocol — operacional

Aplica em \`/validate\` e \`/review-auto\`. Quando busca semântica retorna ∅ mas
grafo retorna vizinhos:

1. Marcar no output: \`### Blind-spot estrutural detectado\`.
2. Listar os vizinhos do grafo.
3. Justificar por que cada vizinho **é ou não é** relevante para a decisão.
4. Só então propor edit (ou recusar).

## Decisão técnica — PRGI descartado

O plugin SpecKit **não chama LLM** (zero usos de \`request.model.sendRequest\`,
\`vscode.lm\`, \`LanguageModelChat\`). Os comandos do \`@speckit\` são lógica TS
determinística que gera artefatos. O LLM real (Copilot Chat) roda **depois**,
fora do plugin, lendo os artefatos.

Por isso, em vez de interceptar prompts (PRGI — Pre-Reasoning Graph Injection),
o subgrafo é **embutido no \`copilot-instructions.md\`** (lido automaticamente
pelo Copilot em todo turn). Mesma garantia técnica forte, sem premium request.

## Créditos

- arXiv **2602.20048v1** — "Navigation Paradox / CodeCompass" (base teórica).
- **safishamsi/graphify** — modelo mental de confidence tags + extração local
  via tree-sitter.`;
}

export function generateGraphNavigationSkill(): string {
  return `---
name: speckit-graph
description: Navegação estrutural por grafo para reduzir blind-spots arquiteturais antes de editar, refatorar ou revisar código. Use quando trabalhar em repositórios com o plugin SpecKit, quando o usuário mencionar grafo, graph-navigation, harness, refatoração, dependências invisíveis, imports, herdeiros, instanciadores ou quando qualquer mudança de código exigir evidência de impacto estrutural.
---

${stripGeneratedFrontmatter(generateGraphNavigation())}`;
}

export function generateGraphReferenceForSkill(): string {
  return stripGeneratedFrontmatter(generateGraphReference());
}

function stripGeneratedFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\s*/, '');
}
