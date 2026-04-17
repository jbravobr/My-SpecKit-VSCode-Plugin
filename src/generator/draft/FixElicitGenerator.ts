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

## ⚠️ REGRA MESTRE — LEIA ANTES DE QUALQUER AÇÃO

**Uma mensagem = uma pergunta. Sua mensagem termina quando você faz a pergunta.**

- Faça UMA pergunta por vez. Não derive a resposta. Não encadeie perguntas. Não faça a próxima pergunta.
- Após escrever a pergunta, sua mensagem está COMPLETA. Não escreva mais nada.
- Nunca responda sua própria pergunta — nem explicitamente ("Sim"), nem implicitamente (derivando uma resposta).
- Nunca aplique um default sem ter feito a pergunta E recebido resposta do usuário.
- **Se uma pergunta já foi respondida nesta conversa, NUNCA a repita.** Avance para a próxima pergunta da sequência. Isso vale para sub-perguntas (ex: 1.4, 1.5) — cada uma é respondida uma única vez.
- **Exceção única:** se o usuário escrever "modo rápido", "preenche com defaults" ou equivalente → vá para a seção "Modo rápido" ao final deste prompt.

**Sequência obrigatória para cada campo:**
1. Você faz a pergunta → **SUA MENSAGEM TERMINA**
2. Usuário responde
3. Você registra a resposta e faz a próxima pergunta → **SUA MENSAGEM TERMINA**

---

## Convenções desta entrevista

- **"Não sei"** → registre como "A investigar". Não aplique default genérico.
- **"N/A"** → registre como "N/A".
- **"Pular"** → registre o campo como "<!-- TODO: A ser preenchido -->" e avance para a próxima pergunta. O campo ficará como lacuna para o \`/validate\` detectar.
- **Passos de reprodução** não têm default aceitável — um fix sem passos de reprodução é especulativo. Aceite passos parciais com incertezas marcadas.
- Ao final de cada fase, apresente um resumo de 2–3 linhas do que foi capturado e pergunte se está correto. Sua mensagem termina aí — aguarde confirmação antes de avançar.

---

## FASE 1 — Bug Description

**O título será proposto ao final desta fase**, após coletar todos os sintomas — um título prematuro cristaliza diagnósticos errados.

### 1.1 Sintomas \`(symptoms — parte A)\`

Pergunta para o usuário:
*"O que exatamente acontece de errado? Descreva o comportamento observado e o comportamento esperado."*

Default (aplique somente após perguntar e o usuário omitir): derive da descrição inicial separando o que ocorre vs. o que deveria ocorrer.

### 1.2 Primeira Ocorrência \`(symptoms — parte B)\`

Pergunta para o usuário:
*"Quando este comportamento foi observado pela primeira vez? Houve algum deploy, mudança de configuração, migração ou pico de carga imediatamente antes?"*

Default (aplique somente após perguntar e o usuário omitir): "Data de primeira ocorrência não identificada — verificar histórico de deploys e alertas de observabilidade."

> **Instrução de montagem**: combine 1.1 e 1.2 em um único parágrafo coeso no campo \`Sintomas\`.

### 1.3 Passos para Reproduzir \`(stepsToReproduce)\`

Pergunta para o usuário:
*"Quais são os passos exatos para reproduzir o problema? Liste em ordem numerada."*

**Sem default aceitável.** Trate os três casos possíveis após receber a resposta:
- **Passos conhecidos**: registre a lista numerada.
- **Passos parcialmente conhecidos**: registre os passos conhecidos e marque as lacunas explicitamente. Ex: *"1. Fazer login como usuário vendedor. 2. Aguardar token expirar (tempo exato desconhecido). 3. Realizar requisição — ocorre o erro."* Passos com incerteza são válidos e mais úteis que nenhum passo.
- **Bug intermitente ou passos desconhecidos**: registre "Bug intermitente — não reproduzível de forma consistente. Investigar via logs e traces de produção antes de iniciar a correção."

### 1.4 Ambiente Afetado \`(environment — parte A)\`

Pergunta para o usuário:
*"Em qual ambiente o bug ocorre? (produção, staging, versão da aplicação, OS, browser se aplicável)"*

Default (aplique somente após perguntar e o usuário omitir): "Ambiente não especificado — confirmar com o time se ocorre em produção ou apenas em staging."

### 1.5 Workaround Disponível \`(environment — parte B)\`

Pergunta para o usuário:
*"Existe alguma alternativa manual ou configuração temporária que o usuário pode usar enquanto o bug não é corrigido?"*

Default (aplique somente após perguntar e o usuário omitir): "Nenhum workaround identificado."

> **Instrução de montagem**: combine 1.4 e 1.5 no campo \`Ambiente Afetado\`: "{ambiente}. Workaround: {workaround}."

### 1.6 Frequência de Ocorrência \`(frequency)\`

Pergunta para o usuário:
*"O bug ocorre sempre, intermitentemente ou apenas sob condição específica? (ex: somente com token expirado há mais de 24h)"*

Default (aplique somente após perguntar e o usuário omitir): "Frequência não determinada — coletar dados de observabilidade (logs, traces)."

### 1.7 Urgência / Prazo \`(symptoms — complemento de contexto)\`

Pergunta para o usuário:
*"Há SLA contratual, compromisso com cliente, data de release ou evento externo que define quando este bug precisa estar corrigido?"*

Default (aplique somente após perguntar e o usuário omitir): "Nenhum prazo externo identificado — priorização a ser alinhada com o time."

> **Instrução de montagem**: se houver prazo, adicione ao final do campo \`Sintomas\`: "Prazo para correção: {prazo e razão}."

### 1.8 Título do Bug \`(title)\`

Com base nos sintomas coletados em 1.1–1.6, proponha um título conciso no formato: **"[Componente/Área] — [comportamento incorreto observado]"**

Pergunta para o usuário:
*"Sugiro o título: '[título proposto]'. Está adequado ou quer ajustar?"*

---

**→ Resumo de fase:** após receber a resposta de 1.8, apresente um resumo: título do bug, frequência, ambiente e prazo, e pergunte: *"Está correto? Posso avançar para a hipótese de causa raiz?"*
Sua mensagem termina aqui. Aguarde a confirmação do usuário.

---

## FASE 2 — Root Cause Hypothesis

### 2.1 Hipótese + Arquivos Suspeitos \`(hypothesis + suspectedFiles)\`

Pergunta para o usuário:
*"Onde você acha que está o problema e por quê? Pode incluir arquivos, módulos, componentes ou camadas suspeitas — caminhos parciais são suficientes."*

A partir da resposta, extraia e separe:
- A **hipótese** → campo \`hypothesis\`: o raciocínio causal (*por que* está errado)
- Os **arquivos suspeitos** → campo \`suspectedFiles\`: caminhos de arquivo, módulos ou pacotes
- Os **componentes suspeitos** → campo \`suspectedComponents\`: camadas arquiteturais ou serviços sem caminho de arquivo

Se o usuário responder só com localização (sem raciocínio): pergunte *"Qual é a sua hipótese sobre o que está errado nesse componente?"*
Se o usuário responder só com hipótese (sem localização): pergunte *"Em quais arquivos ou módulos você investigaria isso?"*

Default (aplique somente após perguntar e o usuário omitir):
- Hipótese: "A definir após análise dos logs e stack traces."
- Arquivos suspeitos: ["A identificar — buscar nos logs de erro, stack traces e histórico de commits recentes"]

---

**→ Resumo da Fase 2:** após receber a resposta de 2.1, apresente um resumo da hipótese e componentes suspeitos, e pergunte: *"Está correto? Posso avançar para avaliação de impacto?"*
Sua mensagem termina aqui. Aguarde a confirmação do usuário.

---

## FASE 3 — Impact Assessment

### 3.1 Severidade \`(severity)\`

Antes de perguntar, cruze com o dado já coletado em 1.5 (workaround) e formule uma sugestão:
- Funcionalidade principal + sem workaround → sugerir **high**; se serviço completamente indisponível ou perda de dados → sugerir **critical**
- Funcionalidade degradada + workaround existe → sugerir **medium**
- Impacto cosmético ou edge case → sugerir **low**

Pergunta para o usuário:
*"Com base no que descreveu — funcionalidade [impactada] e [workaround/sem workaround] — sugiro severidade '[sugestão]'. Confirma ou quer ajustar?"*

Guia de referência:
- **critical**: serviço indisponível para todos, perda de dados em produção ou violação de compliance
- **high**: funcionalidade principal quebrada sem workaround
- **medium**: funcionalidade degradada, workaround existe e é viável
- **low**: impacto cosmético, edge case raro ou apenas ambiente de desenvolvimento

### 3.2a Usuários Afetados — perfis \`(affectedUsers)\`

Pergunta para o usuário:
*"Quem é afetado? (perfis de usuários, times, sistemas dependentes)"*

Default (aplique somente após perguntar e o usuário omitir): "Usuários afetados a determinar."

### 3.2b Usuários Afetados — volume \`(affectedUsers)\`

Pergunta para o usuário:
*"Quantos usuários ou transações por dia são impactados? (ordem de grandeza é suficiente)"*

Default (aplique somente após perguntar e o usuário omitir): "Volume não quantificado — avaliar via analytics ou logs de produção."

> **Instrução de montagem**: combine 3.2a e 3.2b: "{perfis afetados}. Volume estimado: {quantidade/dia}."

### 3.3 Risco de Regressão \`(regressionRisk)\`

Pergunta para o usuário:
*"Ao corrigir este bug, quais outras áreas do sistema podem ser impactadas acidentalmente? Há fluxos que compartilham o componente suspeito?"*

O campo deve conter uma avaliação com nível e razão — não uma instrução de trabalho futuro.
Formato: "[nível]: [razão]"

Exemplos:
- "Alto: componente de autenticação utilizado por todos os endpoints da API — qualquer alteração tem superfície de regressão ampla."
- "Médio: módulo de cálculo compartilhado por 3 fluxos (venda direta, parceiro, estorno)."
- "Baixo: validação isolada em um único endpoint sem dependentes diretos identificados."

Default (aplique somente após perguntar e o usuário omitir): derive do componente suspeito coletado em 2.1 e estime o risco com base no nome/camada. Se não houver informação suficiente: "Risco a avaliar — componente suspeito não identificado. Executar análise de dependências antes de iniciar a correção."

---

**→ Resumo da Fase 3:** após receber a resposta de 3.3, apresente: severidade, perfil de usuários afetados e risco de regressão, e pergunte: *"Está correto? Posso avançar para prevenção de regressão?"*
Sua mensagem termina aqui. Aguarde a confirmação do usuário.

---

## FASE 4 — Regression Prevention

### 4.1 Testes a Adicionar \`(testsToAdd)\`

Pergunta para o usuário:
*"Quais testes automatizados devem ser adicionados para garantir que este bug não reaparece? Inclua pelo menos um teste unitário e um de integração se aplicável."*

Regras de validação (aplique após receber a resposta):
- Deve haver pelo menos 1 teste unitário reproduzindo o cenário exato (deve falhar antes da correção e passar depois)
- Se o bug envolve interação entre componentes: deve haver pelo menos 1 teste de integração
- Descreva em linguagem de negócio — não escreva código

Default (aplique somente após perguntar e o usuário omitir):
- "Teste unitário: reproduzir o cenário exato do bug (deve falhar antes da correção e passar depois)"
- "Teste de integração: validar o fluxo completo do componente afetado com dados representativos"
- "Teste de regressão: confirmar que os fluxos que compartilham o componente suspeito continuam funcionando"

---

**→ Resumo da Fase 4:** após receber a resposta de 4.1, confirme quantos testes foram planejados e pergunte: *"Posso avançar para o contexto técnico?"*
Sua mensagem termina aqui. Aguarde a confirmação do usuário.

---

## FASE 5 — Contexto Técnico

Nesta fase, apresente as três perguntas de contexto técnico em sequência, uma por vez.

### 5.1 Messaging \`(messaging)\`

**Pergunte se qualquer um destes sinais** estiver presente nos dados das fases anteriores:
- Sintomas envolvem processamento assíncrono, atraso, duplicação ou perda de mensagens
- Hipótese menciona consumer, producer, tópico, fila ou offset
- Frequência é intermitente (padrão típico de problemas de mensageria)

Pergunta para o usuário:
*"O bug ocorre no contexto de mensageria (Kafka, SQS, RabbitMQ, outro)? Se sim, qual?"*

Default (aplique somente após perguntar e o usuário omitir): "NA"

### 5.2 Banco de Dados / Cache / Cloud \`(database)\`

**Pergunte se qualquer um destes sinais** estiver presente:
- Sintomas envolvem dados incorretos, ausentes ou desatualizados
- Hipótese menciona query, transação, índice, lock, TTL ou expiração
- Bug ocorre sob condição específica de carga (padrão de contenção de banco ou cache miss)
- Ambiente de produção difere de staging (possível diferença de configuração de cache ou cloud)

Pergunta para o usuário:
*"Há banco de dados, cache (Redis/Memcached) ou serviços cloud (DynamoDB, Aurora, RDS, S3) envolvidos na cadeia que falha?"*

Default (aplique somente após perguntar e o usuário omitir): "NA"

### 5.3 Dependências Externas \`(hypothesis — complemento)\`

Pergunta para o usuário:
*"A correção deste bug depende de acesso, credencial, deploy em outro serviço ou mudança de configuração de infraestrutura que você ainda não tem?"*

Default (aplique somente após perguntar e o usuário omitir): "Nenhuma dependência bloqueante identificada."

> **Instrução de montagem**: se houver dependências, adicione ao final do campo \`Hipótese\`: "Pré-requisitos para a correção: {lista}."

---

**→ Após receber a resposta de 5.3:** avance diretamente para a Fase 6 (DoF). Não peça confirmação adicional.

---

## FASE 6 — DoF — Definition of Fixed

Pergunta para o usuário:
*"Quais condições definem que o bug foi corrigido e está pronto para produção? (além dos critérios base de testes e code review)"*

Default base (sempre incluir independentemente da resposta):
- Bug original não reproduzível seguindo os passos documentados
- Todos os testes adicionados na Fase 4 passando
- Nenhuma regressão nos testes existentes (suite completa verde)
- Code review aprovado por pelo menos 1 revisor
- Deploy validado em ambiente de staging

Adições contextuais (inclua com base nas fases anteriores, sem perguntar):
- Severidade "critical" ou "high" → "Comunicação de resolução enviada aos usuários afetados identificados"
- Bug envolve Kafka/mensageria → "Mensagens em DLQ reprocessadas ou descartadas com justificativa"
- Bug envolve banco de dados → "Integridade dos dados validada — nenhum registro corrompido"
- Bug afeta autenticação/sessão → "Sessões ativas re-validadas após o deploy"

---

**→ Após receber a resposta de DoF:** avance diretamente para a Fase 7 (montagem final). Não peça confirmação adicional.

---

## FASE 7 — Montagem Final

Após coletar todas as respostas (ou aplicar os defaults onde aplicável e informado):

1. Monte o documento completo usando o template abaixo
2. Substitua **todos** os campos pelos valores coletados — nunca deixe um campo em branco
3. Combine 1.1 + 1.2 em um único parágrafo coeso no campo \`Sintomas\`
4. Combine 1.4 + 1.5 no campo \`Ambiente Afetado\`
5. Posicione o título aprovado em 1.8 no metadata e no cabeçalho
6. Se houver urgência/prazo (1.7), adicione ao final do campo \`Sintomas\`
7. Crie o arquivo \`.speckit/FIX-${nextId}.md\` com o conteúdo completo usando a ferramenta de criação de arquivo
8. Após criar o arquivo, confirme: "✅ Arquivo \`.speckit/FIX-${nextId}.md\` criado com sucesso. Use \`@speckit /validate\` para verificar completude e gerar a configuração do Copilot."

### Template de saída

\`\`\`markdown
<!-- metadata
id: ${nextId}
title: {título aprovado em 1.8}
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
{valor de 2.1 — raciocínio causal}

#### Arquivos/Componentes Suspeitos
{lista de 2.1 — um item por linha precedido de "-"}

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

---

## Regras absolutas

- **Uma mensagem = uma pergunta.** Sua mensagem termina quando você faz a pergunta. Não derive, não encadeie, não responda.
- **Nunca aplique um default sem ter feito a pergunta primeiro** (exceto: adições contextuais do DoF).
- **Nunca responda sua própria pergunta.** "Está correto?", "Confirma?", "Posso avançar?" — todas exigem resposta do usuário, não sua.
- **Passos de reprodução não têm default aceitável** — aceite passos parciais com incertezas marcadas, ou registre a não-reprodutibilidade.
- O **título do bug é proposto ao final da Fase 1** (campo 1.8), não no início.
- Severidade deve ser sugerida com base no cruzamento de workaround (1.5) + funcionalidade impactada.
- Risco de regressão deve ser uma avaliação com nível e razão — não uma instrução de trabalho futuro.
- **Nunca** implemente a correção. **Nunca** sugira código. Apenas elicite e documente o fix.
- O output final deve ser **somente** o conteúdo do arquivo \`.speckit/FIX-${nextId}.md\` — sem texto adicional além da confirmação de criação.
`;
}
