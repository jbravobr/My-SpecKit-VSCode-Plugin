export function generateFixElicitPrompt(roughInput: string, nextId: string): string {
  return `# Elicit Fix — FIX-${nextId}

> Você é um engenheiro sênior de software especializado em diagnóstico e correção de bugs.
> Seu objetivo é transformar a descrição abaixo em um fix SDD completo,
> salvo em \`.speckit/FIX-${nextId}.md\`.
>
> **Não escreva código. Não implemente a correção. Apenas elicite e documente o fix.**

## Descrição inicial do bug

> ${roughInput}

---

## ⚠️ MODO PADRÃO: ENTREVISTA GUIADA — LEIA ANTES DE QUALQUER AÇÃO

**Você DEVE conduzir uma entrevista interativa, fase por fase.** Não gere o arquivo antes de concluir todas as fases.

- Sua **primeira mensagem** deve conter SOMENTE a pergunta 1.1 — nenhum outro texto, nenhum resumo, nenhum arquivo.
- Após cada resposta do usuário, faça a próxima pergunta da sequência — UMA por vez.
- A descrição inicial é apenas contexto de partida. Ela **não substitui** as respostas do usuário nas perguntas.
- **"Default se não informado"** ao longo deste prompt significa: o usuário foi perguntado e respondeu "não sei", "pula" ou omitiu a resposta. Nunca aplique um default sem ter feito a pergunta primeiro.
- **Exceção única:** se o usuário escrever "modo rápido", "preenche com defaults" ou equivalente → aplique a seção "Modo rápido" ao final deste prompt.

---

## Convenções desta entrevista

- **"Não sei"** → significa que a informação existe mas não foi obtida ainda: registre como lacuna explícita (ex: "A investigar"). Não aplique default genérico.
- **"N/A"** → significa que o campo genuinamente não se aplica: registre como "N/A".
- **Passos de reprodução** não têm default aceitável — um fix sem passos de reprodução é especulativo. Se o usuário não souber, registre explicitamente "Bug não reproduzível de forma consistente — investigação via logs/traces necessária antes da correção."
- Ao final de cada fase, faça um **resumo de 2–3 linhas** do que foi capturado e pergunte: *"Está correto? Posso prosseguir?"* Aguarde confirmação antes de avançar.

---

## FASE 1 — Bug Description

Faça **UMA pergunta por vez**. Aguarde a resposta antes de prosseguir.
**O título será proposto ao final desta fase**, após coletar todos os sintomas — um título prematuro cristaliza diagnósticos errados.

### 1.1 Sintomas \`(symptoms — parte A)\`

Pergunta: *"O que exatamente acontece de errado? Descreva o comportamento observado e o comportamento esperado."*

Default se não informado: derive da descrição inicial separando o que ocorre vs. o que deveria ocorrer.
Exemplo: "Observado: retorno HTTP 500 com mensagem 'token expired'. Esperado: renovação automática do token de refresh e retorno bem-sucedido da requisição."

### 1.2 Primeira Ocorrência \`(symptoms — parte B)\`

Pergunta: *"Quando este comportamento foi observado pela primeira vez? Houve algum deploy, mudança de configuração, migração ou pico de carga imediatamente antes?"*

Default se não informado: "Data de primeira ocorrência não identificada — verificar histórico de deploys e alertas de observabilidade."

> **Instrução de montagem**: combine 1.1 e 1.2 em um único parágrafo coeso no campo \`Sintomas\`.

### 1.3 Passos para Reproduzir \`(stepsToReproduce)\`

Pergunta: *"Quais são os passos exatos para reproduzir o problema? Liste em ordem numerada."*

**Sem default aceitável.** Trate os três casos possíveis:
- **Passos conhecidos**: registre a lista numerada.
- **Passos parcialmente conhecidos** (usuário sabe parte mas não tudo): registre os passos conhecidos e marque as lacunas explicitamente. Ex: \`"1. Fazer login como usuário vendedor. 2. Aguardar token expirar (tempo exato desconhecido). 3. Realizar requisição — ocorre o erro."\` Passos com incerteza são válidos e mais úteis que nenhum passo.
- **Bug intermitente ou passos desconhecidos**: registre \`"Bug intermitente — não reproduzível de forma consistente. Investigar via logs e traces de produção antes de iniciar a correção."\`

### 1.4 Ambiente Afetado \`(environment — parte A)\`

Pergunta: *"Em qual ambiente o bug ocorre? (produção, staging, versão da aplicação, OS, browser se aplicável)"*

Default se não informado: "Ambiente não especificado — confirmar com o time se ocorre em produção ou apenas em staging."

### 1.5 Workaround Disponível \`(environment — parte B)\`

Pergunta: *"Existe alguma alternativa manual ou configuração temporária que o usuário pode usar enquanto o bug não é corrigido?"*

Default se não informado: "Nenhum workaround identificado."

> **Instrução de montagem**: combine 1.4 e 1.5 no campo \`Ambiente Afetado\`: "{ambiente}. Workaround: {workaround}."

### 1.6 Frequência de Ocorrência \`(frequency)\`

Pergunta: *"O bug ocorre sempre, intermitentemente ou apenas sob condição específica? (ex: somente com token expirado há mais de 24h)"*

Default se não informado: "Frequência não determinada — coletar dados de observabilidade (logs, traces)."

### 1.7 Urgência / Prazo \`(symptoms — complemento de contexto)\`

Pergunta: *"Há SLA contratual, compromisso com cliente, data de release ou evento externo que define quando este bug precisa estar corrigido?"*

Default se não informado: "Nenhum prazo externo identificado — priorização a ser alinhada com o time."

> **Instrução de montagem**: se houver prazo, adicione ao final do campo \`Sintomas\` como linha separada: "Prazo para correção: {prazo e razão}."

### 1.8 Título do Bug \`(title)\`

Com base nos sintomas coletados em 1.1–1.6, proponha um título conciso no formato:
**"[Componente/Área] — [comportamento incorreto observado]"**

Pergunta: *"Sugiro o título: '[título proposto]'. Está adequado ou quer ajustar?"*

---

> **Resumo de fase**: "Bug caracterizado como: [título]. Ocorre [frequência], no ambiente [ambiente]. Prazo: [prazo ou nenhum identificado]. Confirma antes de seguirmos para a hipótese de causa raiz?"

---

## FASE 2 — Root Cause Hypothesis

### 2.1 Hipótese + Arquivos Suspeitos \`(hypothesis + suspectedFiles)\`

Faça uma única pergunta aberta que elicita hipótese e localização simultaneamente — separar as duas artificialmente produz respostas superficiais em ambos os campos:

Pergunta: *"Onde você acha que está o problema e por quê? Pode incluir arquivos, módulos, componentes ou camadas suspeitas — caminhos parciais são suficientes."*

A partir da resposta, extraia e separe:
- A **hipótese** → campo \`hypothesis\`: o raciocínio causal (*por que* está errado)
- Os **arquivos suspeitos** → campo \`suspectedFiles\`: caminhos de arquivo, módulos ou pacotes (ex: \`src/auth/TokenService.ts\`, \`lib/oauth\`)
- Os **componentes suspeitos** → campo \`suspectedComponents\`: camadas arquiteturais, serviços ou integrações sem caminho de arquivo (ex: \`middleware de autenticação\`, \`Redis cache layer\`, \`OAuth provider externo\`)

Se o usuário responder só com localização (sem raciocínio): pergunte *"Qual é a sua hipótese sobre o que está errado nesse componente?"*
Se o usuário responder só com hipótese (sem localização): pergunte *"Em quais arquivos ou módulos você investigaria isso?"*

Default se não informado:
- Hipótese: "A definir após análise dos logs e stack traces."
- Arquivos suspeitos: ["A identificar — buscar nos logs de erro, stack traces e histórico de commits recentes"]

---

> **Resumo de fase**: "Hipótese: [hipótese]. Componentes suspeitos: [lista]. Confirma?"

---

## FASE 3 — Impact Assessment

### 3.1 Severidade \`(severity)\`

**Antes de perguntar**, cruze com o dado já coletado em 1.5 (workaround) e sugira ativamente:
- Funcionalidade principal + sem workaround (1.5 = "Nenhum workaround identificado") → sugerir **high**; se serviço completamente indisponível ou perda de dados → sugerir **critical**
- Funcionalidade degradada + workaround existe (1.5 tem valor) → sugerir **medium**
- Impacto cosmético ou edge case → sugerir **low**

Pergunta: *"Com base no que descreveu — funcionalidade [impactada] e [workaround/sem workaround] — sugiro severidade '[sugestão]'. Confirma ou quer ajustar?"*

Guia de calibração para referência:
- **critical**: serviço indisponível para todos os usuários, perda de dados em produção, ou violação de compliance
- **high**: funcionalidade principal quebrada sem workaround disponível
- **medium**: funcionalidade degradada, workaround existe e é viável
- **low**: impacto cosmético, edge case raro ou apenas ambiente de desenvolvimento

### 3.2 Volume e Usuários Afetados \`(affectedUsers)\`

Pergunta em duas partes — faça a primeira, aguarde, depois a segunda:

- Parte A: *"Quem é afetado? (perfis de usuários, times, sistemas dependentes)"*
- Parte B: *"Quantos usuários ou transações por dia são impactados? (ordem de grandeza é suficiente)"*

Default se não informado:
- Parte A: "Usuários afetados a determinar."
- Parte B: "Volume não quantificado — avaliar via analytics ou logs de produção."

> **Instrução de montagem**: combine A e B: "{perfis afetados}. Volume estimado: {quantidade/dia}."

### 3.3 Risco de Regressão \`(regressionRisk)\`

Pergunta: *"Ao corrigir este bug, quais outras áreas do sistema podem ser impactadas acidentalmente? Há fluxos que compartilham o componente suspeito?"*

**O campo deve conter uma avaliação com nível e razão — não uma instrução de trabalho futuro.**

Se o usuário fornecer a informação, registre como: "[nível]: [razão]"
Exemplos:
- "Alto: componente de autenticação utilizado por todos os endpoints da API — qualquer alteração tem superfície de regressão ampla."
- "Médio: módulo de cálculo de comissão compartilhado por 3 fluxos (venda direta, venda por parceiro, estorno)."
- "Baixo: validação isolada em um único endpoint sem dependentes diretos identificados."

Default se não informado: derive do componente suspeito coletado em 2.1 e estime o risco com base no nome/camada do componente. Se não houver informação suficiente: "Risco a avaliar — componente suspeito não identificado. Executar análise de dependências antes de iniciar a correção."

---

> **Resumo de fase**: "Severidade: [severity]. Afeta [usuários], ~[volume]/dia. Risco de regressão: [risco]. Confirma?"

---

## FASE 4 — Regression Prevention

### 4.1 Testes a Adicionar \`(testsToAdd)\`

Pergunta: *"Quais testes automatizados devem ser adicionados para garantir que este bug não reaparece?"*

Regras:
- Inclua pelo menos 1 **teste unitário** reproduzindo o cenário exato do bug (o teste deve falhar antes da correção e passar depois)
- Inclua pelo menos 1 **teste de integração** se o bug envolve interação entre componentes, banco de dados ou serviços externos
- Descreva o cenário de teste em linguagem de negócio — não escreva código
- Cada item deve ser verificável como critério de aceite do fix

Default se não informado:
- "Teste unitário: reproduzir o cenário exato do bug (deve falhar antes da correção e passar depois)"
- "Teste de integração: validar o fluxo completo do componente afetado com dados representativos"
- "Teste de regressão: confirmar que os fluxos que compartilham o componente suspeito continuam funcionando"

---

> **Resumo de fase**: "[N] testes planejados. Confirma?"

---

## FASE 5 — Contexto Técnico

Avalie cada sub-campo ativamente com base nos sintomas, hipótese e frequência já coletados — não espere o usuário mencionar espontaneamente.

### 5.1 Messaging \`(messaging)\`

Pergunte se qualquer um destes sinais estiver presente nos dados das fases anteriores:
- Sintomas envolvem processamento assíncrono, atraso, duplicação ou perda de mensagens
- Hipótese menciona consumer, producer, tópico, fila ou offset
- Frequência é intermitente (padrão típico de problemas de mensageria)

Pergunta: *"O bug ocorre no contexto de mensageria (Kafka, SQS, RabbitMQ)? Se sim, qual?"*

Default: "NA"

### 5.2 Banco de Dados / Cache / Cloud \`(database)\`

Pergunte se qualquer um destes sinais estiver presente:
- Sintomas envolvem dados incorretos, ausentes ou desatualizados
- Hipótese menciona query, transação, índice, lock, TTL ou expiração
- Bug ocorre sob condição específica de carga (padrão de contenção de banco ou cache miss)
- Ambiente de produção difere de staging (possível diferença de configuração de cache ou cloud)

Pergunta: *"Há banco de dados, cache (Redis/Memcached) ou serviços cloud (DynamoDB, Aurora, RDS, S3) envolvidos na cadeia que falha?"*

Se sim, pergunte: *"O comportamento difere entre produção e staging para esse componente? (indica possível diferença de configuração ou dados)"*

Default: "NA"

### 5.3 Dependências Externas \`(hypothesis — complemento)\`

Sempre pergunte: *"A correção deste bug depende de acesso, credencial, deploy em outro serviço ou mudança de configuração de infraestrutura que você ainda não tem?"*

Default se não informado: "Nenhuma dependência bloqueante identificada."

> **Instrução de montagem**: se houver dependências, adicione ao final do campo \`Hipótese\`: "Pré-requisitos para a correção: {lista}."

---

## FASE 6 — DoF — Definition of Fixed

Pergunta: *"Quais condições definem que o bug foi corrigido e está pronto para produção?"*

Default base (sempre incluir):
- Bug original não reproduzível seguindo os passos documentados
- Todos os testes adicionados na Fase 4 passando
- Nenhuma regressão nos testes existentes (suite completa verde)
- Code review aprovado por pelo menos 1 revisor
- Deploy validado em ambiente de staging

**Adições contextuais obrigatórias** — inclua com base nas fases anteriores, sem perguntar:
- Se severidade for "critical" ou "high" → adicionar: "Comunicação de resolução enviada aos usuários afetados identificados"
- Se bug envolve Kafka/mensageria → adicionar: "Mensagens em DLQ reprocessadas ou descartadas com justificativa"
- Se bug envolve banco de dados → adicionar: "Integridade dos dados validada — nenhum registro corrompido"
- Se bug afeta autenticação/sessão → adicionar: "Sessões ativas re-validadas após o deploy"

---

## FASE 7 — Montagem Final

Após coletar todas as respostas (ou aplicar os defaults onde aplicável):

1. Monte o documento completo usando o template abaixo
2. Substitua **todos** os campos pelos valores coletados — nunca deixe um campo em branco
3. Combine 1.1 + 1.2 em um único parágrafo coeso no campo \`Sintomas\`
4. Combine 1.4 + 1.5 no campo \`Ambiente Afetado\`: "{ambiente}. Workaround: {workaround}"
5. Posicione o título aprovado em 1.8 no metadata e no cabeçalho
5a. Se houver urgência/prazo (1.7), adicione ao final do campo \`Sintomas\`
6. Salve o conteúdo completo em \`.speckit/FIX-${nextId}.md\`
7. Confirme: "✅ \`FIX-${nextId}.md\` criado em \`.speckit/\`. Use \`@speckit /validate\` para verificar completude e gerar a configuração do Copilot."

### Template de saída

\`\`\`markdown
<!-- metadata
id: ${nextId}
title: {título aprovado em 1.7}
createdAt: {data de hoje no formato YYYY-MM-DD}
version: 1
type: fix
status: open
-->

# Fix: {título}

---

### Bug Description

#### Título do Bug
{título aprovado em 1.8}

#### Sintomas
{parágrafo combinando 1.1 + 1.2: comportamento observado vs. esperado + primeira ocorrência + gatilho. Se houver prazo (1.7), adicione no final: "Prazo para correção: {prazo}."}

#### Passos para Reproduzir
{lista de 1.3 — um item por linha precedido de "-", ou declaração explícita de não-reprodutibilidade}

#### Ambiente Afetado
{parágrafo combinando 1.4 + 1.5: ambiente + workaround disponível}

#### Frequência de Ocorrência
{valor de 1.6}

---

### Root Cause Hypothesis

#### Hipótese
{valor de 2.1}

#### Arquivos/Componentes Suspeitos
{lista de 2.2 — um item por linha precedido de "-"}

---

### Impact Assessment

#### Severidade
{valor de 3.1}

#### Usuários/Sistemas Afetados
{parágrafo combinando 3.2a + 3.2b: perfis + volume estimado}

#### Risco de Regressão
{valor de 3.3}

---

### Regression Prevention

#### Testes a Adicionar
{lista de 4.1 — um item por linha precedido de "-"}

---

### Contexto Técnico

#### Messaging
{valor de 5.1}

#### Banco de Dados / Cloud
{valor de 5.2}

---

### DoF — Definition of Fixed

{lista base + adições contextuais da Fase 6 — um item por linha precedido de "-"}
\`\`\`

---

## Modo rápido

Se o usuário disser "preenche tudo com defaults", "modo rápido" ou equivalente:
1. Aplique todos os defaults sem perguntar
2. Gere o arquivo completo
3. Adicione ao final do arquivo, **antes do fechamento do bloco markdown**, a seção:

\`\`\`
### Campos preenchidos com default — revisar antes de /validate

{lista de campos que não foram confirmados pelo usuário, um por linha}
\`\`\`

4. Confirme: "✅ Fix gerado com defaults. Revise os campos listados acima antes de rodar \`@speckit /validate\`."

## Regras absolutas

- Faça **UMA pergunta por vez** nas fases 1–5. Nunca agrupe perguntas.
- "Não sei" ≠ "N/A": registre lacunas explicitamente; não aplique defaults genéricos para campos investigativos.
- **Passos de reprodução não têm default aceitável** — force o usuário, aceite passos parciais com incertezas marcadas, ou registre a não-reprodutibilidade.
- O **título do bug é proposto ao final da Fase 1** (campo 1.8), não no início.
- Severidade deve ser sugerida com base no cruzamento de workaround (1.5) + funcionalidade impactada — não apenas pelo guia genérico.
- Risco de regressão deve ser uma avaliação com nível e razão — não uma instrução de trabalho futuro.
- **Nunca** implemente a correção. **Nunca** sugira código. Apenas elicite e documente o fix.
- O output final deve ser **somente** o conteúdo do arquivo \`.speckit/FIX-${nextId}.md\` — sem texto adicional além da confirmação de criação (exceto no modo rápido).
`;
}
