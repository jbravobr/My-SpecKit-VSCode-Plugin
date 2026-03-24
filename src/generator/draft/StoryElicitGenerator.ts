export function generateStoryElicitPrompt(roughInput: string, nextId: string): string {
  return `# Elicit Story — STORY-${nextId}

> Você é um analista de produto e arquiteto de software sênior.
> Seu objetivo é transformar a ideia abaixo em uma história SDD completa,
> salva em \`.speckit/STORY-${nextId}.md\`.
>
> **Não escreva código. Não implemente nada. Apenas elicite e documente a spec.**

## Ideia inicial do usuário

> ${roughInput}

---

## Convenções desta entrevista

- **"Não sei"** → significa que a informação existe mas não foi fornecida: registre como lacuna explícita (ex: "A definir com o time"). Não aplique default silencioso.
- **"N/A"** → significa que o campo genuinamente não se aplica: registre como "N/A" e siga em frente.
- **Default** → aplicado apenas quando o campo tem valor razoável de mercado e o usuário não demonstrou restrição específica. Sempre informe que está usando um default.
- Ao final de cada fase, faça um **resumo de 2–3 linhas** do que foi capturado e pergunte: *"Está correto? Posso prosseguir?"* Aguarde confirmação antes de avançar.

---

## FASE 1 — Requisito de Negócio

Faça **UMA pergunta por vez**. Aguarde a resposta antes de prosseguir para o próximo campo.

### 1.1 Problema \`(problem)\`

Pergunta: *"Qual dor, ineficiência ou lacuna esta funcionalidade resolve? Quem sente essa dor hoje e com qual frequência?"*

Default se não informado: derive da ideia inicial reformulando como enunciado de problema objetivo.
Exemplo: "O cálculo de comissões é feito em batch noturno, gerando visibilidade defasada de D+1 para os vendedores."

### 1.2 Por que agora? \`(problem — complemento)\`

Pergunta: *"O que torna esta entrega urgente ou relevante neste momento? Há um prazo, evento externo, pressão de stakeholder ou volume de suporte que justifique priorizar agora?"*

Default se não informado: "Motivação de urgência não especificada — priorização a ser alinhada com o time de produto."

> **Instrução de montagem**: combine 1.1 e 1.2 em um único parágrafo coeso no campo \`Problema\` do template de saída.

### 1.3 Valor \`(value)\`

Pergunta em duas partes — faça a primeira, aguarde, depois a segunda:

- Parte A: *"O que muda — e para quem — quando isso for entregue?"*
- Parte B: *"Como você vai saber que deu certo? Qual indicador ou métrica vai se mover?"*

Default se não informado:
- Parte A: derive da ideia inicial descrevendo o benefício operacional.
- Parte B: "Indicador de sucesso a definir após primeira medição em produção."

> **Instrução de montagem**: combine A e B em um único parágrafo no campo \`Valor\`: "{benefício}. Indicador de sucesso: {métrica}."

### 1.4 Stakeholders \`(stakeholders)\`

Pergunta: *"Quem é impactado ou tem interesse no resultado? Liste times, sistemas dependentes e usuários finais."*

Default se não informado: ["Time de Produto", "Usuários finais"].

---

> **Resumo de fase**: após receber as respostas, resuma: "Capturei o seguinte sobre o requisito de negócio: [resumo]. Está correto?"

---

## FASE 2 — Especificação Funcional

### 2.1 User Stories \`(userStories)\`

Pergunta: *"Quais são as ações que um usuário ou sistema externo executa? Use: Como [ator com objetivo], quero [ação] para [benefício]."*

Regras:
- Formato obrigatório: "Como [ator com objetivo], quero [ação] para [benefício]"
- O ator deve ser um ser humano ou sistema externo com um objetivo de negócio (ex: "vendedor", "sistema de pagamentos")
- **Evite "sistema" como ator**: comportamentos puramente internos (ex: consumir evento Kafka, persistir no banco) não são user stories — são critérios de aceite. Se o usuário sugerir "Como sistema, quero consumir...", redirecione: *"Esse comportamento interno ficará melhor como critério de aceite. Qual é a perspectiva do usuário ou sistema externo que desencadeia isso?"*
- Mínimo de 2, máximo de 5

Default se não informado: derive 2–3 user stories a partir da ideia inicial usando atores com objetivos de negócio claros.

### 2.2 Critérios de Aceite \`(acceptanceCriteria)\`

Pergunta: *"Quais condições verificáveis provam que cada user story está funcionando? Inclua comportamentos do sistema, limites, e casos de erro relevantes."*

Regras:
- Cada critério começa com verbo no infinitivo (Consumir, Persistir, Emitir, Rejeitar, Calcular, Validar, Retornar, Notificar)
- Deve ser mensurável e testável por um teste automatizado
- Cubra: happy path, limites de dados e pelo menos 1 caso de erro ou rejeição
- Mínimo de 3 itens

Default se não informado: derive 3–5 critérios a partir das user stories, cobrindo happy path + 1 caso de rejeição.

### 2.3 Fora de Escopo \`(outOfScope)\`

Pergunta: *"O que explicitamente NÃO será feito nesta história? Pense nas extensões óbvias que alguém poderia pedir depois."*

**Instrução**: derive os itens a partir das user stories e do domínio da ideia inicial — não use defaults genéricos. Identifique as extensões naturais do escopo descrito e as exclua explicitamente.
Exemplo para um consumer Kafka de comissões: ["Configuração de regras de comissão via interface admin", "Cálculo retroativo de comissões históricas", "Dashboard de visualização de comissões em tempo real"].

Default de fallback se nenhum contexto disponível: ["Funcionalidades de configuração via interface", "Relatórios e consultas históricas", "Integrações com sistemas externos além do descrito"].

---

> **Resumo de fase**: "Capturei [N] user stories, [N] critérios de aceite e [N] itens fora de escopo. Confirma antes de seguirmos para os requisitos não-funcionais?"

---

## FASE 3 — Especificação Não-Funcional

**Regra**: para campos não mencionados pelo usuário, aplique os defaults abaixo informando que está fazendo isso. Pergunte apenas se houver sinais de restrição específica na ideia.

### 3.1 Performance \`(performance)\`

**Antes de aplicar o default**, avalie o contexto:
- Se a ideia menciona processamento assíncrono, batch, consumer, pipeline ou job → **não aplique SLA de latência**. Use: "Processamento assíncrono — SLA de latência não aplicável. Monitorar throughput e lag de fila."
- Se a ideia menciona API, endpoint, requisição síncrona ou interface → aplique o default de latência.
- Se o usuário mencionou SLA explicitamente → use o valor informado.

**Default para serviços síncronos:** "P99 < 500ms. Throughput: sem restrição definida — revisar após primeira medição em produção."

### 3.2 Segurança \`(security)\`

**Default obrigatório:** "Nenhum dado pessoal (PII) nos logs. Credenciais via variáveis de ambiente. Inputs validados contra schema antes do processamento."

Pergunte somente se a ideia mencionar dados sensíveis, autenticação de usuários ou exposição pública: *"Há requisitos de autenticação, autorização ou LGPD que precisam ser observados?"*

### 3.3 Escalabilidade \`(scalability)\`

**Default obrigatório:** "Escalonamento horizontal via réplicas stateless. Sem estado local em memória entre execuções."

### 3.4 Usabilidade \`(usability)\`

Avalie automaticamente:
- Ideia menciona interface, frontend, UI, tela, formulário, dashboard → pergunte: *"Há requisitos de experiência do usuário, acessibilidade ou responsividade?"*
- Caso contrário → aplique default sem perguntar.

**Default para serviços sem interface:** "N/A — serviço sem interface de usuário direta."

### 3.5 Disponibilidade \`(availability)\`

**Default obrigatório:** "99,5% uptime. Falhas transitórias acionam retry com backoff exponencial (3 tentativas, backoff inicial 500ms) antes do envio ao DLQ ou retorno de erro ao cliente."

---

> **Resumo de fase**: "Defaults de NFR aplicados: performance=[valor], segurança=[valor], disponibilidade=[valor]. Confirma?"

---

## FASE 4 — Especificação Técnica

### 4.1 Linguagem \`(language)\`

Pergunta: *"Qual linguagem de programação? (typescript | javascript | java | csharp | python)"*

Sugestão contextual baseada na ideia:
- Kafka + microserviço → java ou typescript
- ML / dados / análise → python
- Web frontend → typescript ou javascript

Default se não informado: "typescript"

### 4.2 Framework \`(framework)\`

Pergunta: *"Qual framework? (dotnet | springboot | angular | react | fastapi | other)"*

Default por linguagem: typescript → other | java → springboot | python → fastapi | csharp → dotnet

### 4.3 Arquitetura \`(architecture)\`

Pergunta: *"Qual padrão arquitetural? (hexagonal | layered | microservices | monolith | serverless)"*

Default baseado na complexidade inferida:
- Lógica de domínio rica, múltiplos casos de uso, regras de negócio → "hexagonal"
- CRUD simples, scripts, utilitários, jobs → "layered"

### 4.4 Target \`(target)\`

Avalie automaticamente a partir da ideia inicial — não pergunte:
- Menciona API / REST / GraphQL / banco de dados → "backend"
- Menciona React / Angular / UI / tela / formulário → "frontend"
- Menciona orquestração / BFF / gateway / proxy → "bff"
- Menciona Kafka / eventos / stream / consumer / producer → "backend"
- Menciona Lambda / function / trigger → "script"
- Menciona SDK / biblioteca compartilhada / pacote → "library"

Default: "backend"

### 4.5 Banco de Dados \`(database)\`

Pergunta: *"Qual banco de dados será utilizado? (tecnologia + propósito)"*

Se não informado: "A definir — nenhum banco identificado na ideia inicial."
Se o usuário disser "não sei": registre como "A definir com o time de arquitetura." (não aplique default — é uma lacuna real).

### 4.6 Infraestrutura \`(infrastructure)\`

Pergunta: *"Onde o serviço será implantado? (Kubernetes, Lambda, Docker, cloud provider)"*

Se não informado: "A definir — sem restrições de infraestrutura identificadas."
Se o usuário disser "não sei": registre como "A definir com o time de infra."

---

> **Resumo de fase**: "Stack definida: [linguagem] + [framework], arquitetura [padrão], target [tipo]. Confirma?"

---

## FASE 5 — DoR e DoD

### DoR — Definition of Ready

Avalie cada critério individualmente após preencher as fases anteriores.

**Critérios verificáveis pelo AI** (marque \`[x]\` se o dado foi coletado durante a entrevista):
- [ ] User stories com critérios de aceite mensuráveis
- [ ] Escopo delimitado (o que está e o que não está incluído)
- [ ] Requisitos não-funcionais definidos (performance, segurança, disponibilidade)
- [ ] Stack técnica decidida (linguagem, framework, arquitetura)
- [ ] Padrão arquitetural definido

**Critérios que requerem ação humana** (mantenha sempre como \`[ ]\` — não marque automaticamente):
- [ ] Requisito de negócio documentado e aprovado pelo stakeholder responsável
- [ ] DoD acordado com o time de desenvolvimento

### DoD — Definition of Done

Pergunta: *"Quais condições definem 'pronto para produção' neste contexto?"*

Default base (sempre incluir):
- Todos os critérios de aceite validados por testes automatizados
- Cobertura de testes ≥ 80%
- Code review aprovado por pelo menos 1 revisor
- Deploy em ambiente de homologação validado

**Adições contextuais obrigatórias** — inclua com base no target e tecnologias da Fase 4, sem perguntar:
- Se target for "backend" e houver endpoint exposto → adicionar: "Contrato de API (OpenAPI/schema) atualizado"
- Se target for "frontend" → adicionar: "Acessibilidade WCAG 2.1 AA verificada" e "Testado nos browsers definidos como suportados"
- Se ideia mencionar Kafka/consumer → adicionar: "Offset lag e DLQ rate monitorados e abaixo do threshold definido"
- Se houver mudança de schema de banco → adicionar: "Migration idempotente validada em staging"
- Se houver funcionalidade de segurança → adicionar: "Scan de segurança (SAST) sem findings críticos"

---

## FASE 6 — Montagem Final

Após coletar todas as respostas (ou aplicar os defaults onde aplicável):

1. Monte o documento completo usando o template abaixo
2. Substitua **todos** os campos pelos valores coletados — nunca deixe um campo em branco
3. Combine 1.1 + 1.2 em um único parágrafo coeso no campo \`Problema\`
4. Combine 1.3a + 1.3b em um único parágrafo coeso no campo \`Valor\`
5. Marque \`[x]\` somente nos itens de DoR verificáveis pelo AI; mantenha \`[ ]\` nos que requerem ação humana
6. Salve o conteúdo completo em \`.speckit/STORY-${nextId}.md\`
7. Confirme: "✅ \`STORY-${nextId}.md\` criado em \`.speckit/\`. Use \`@speckit /validate\` para verificar completude e gerar a configuração do Copilot."

### Template de saída

\`\`\`markdown
<!-- metadata
id: ${nextId}
title: {título derivado da ideia inicial — conciso, orientado ao valor de negócio}
createdAt: {data de hoje no formato YYYY-MM-DD}
version: 1
type: story
status: open
-->

# História: {título}

---

### Requisito de Negócio

#### Problema
{parágrafo combinando 1.1 + 1.2: problema + contexto de urgência}

#### Valor
{parágrafo combinando 1.3a + 1.3b: benefício + indicador de sucesso}

#### Stakeholders
{lista de 1.4 — um item por linha precedido de "-"}

---

### Especificação Funcional

#### User Stories
{lista de 2.1 — um item por linha precedido de "-"}

#### Critérios de Aceite
{lista de 2.2 — um item por linha precedido de "-"}

#### Fora de Escopo
{lista de 2.3 derivada do contexto — um item por linha precedido de "-"}

---

### Especificação Não-Funcional

#### Performance
{valor de 3.1 — inferido a partir do tipo de serviço}

#### Segurança
{valor de 3.2}

#### Escalabilidade
{valor de 3.3}

#### Usabilidade
{valor de 3.4}

#### Disponibilidade
{valor de 3.5}

---

### Especificação Técnica

#### Linguagem
{valor de 4.1}

#### Framework
{valor de 4.2}

#### Arquitetura
{valor de 4.3}

#### Target
{valor de 4.4}

#### Banco de Dados
{valor de 4.5}

#### Infraestrutura
{valor de 4.6}

---

### DoR — Definition of Ready

- [x] User stories com critérios de aceite mensuráveis
- [x] Escopo delimitado (o que está e o que não está incluído)
- [x] Requisitos não-funcionais definidos (performance, segurança, disponibilidade)
- [x] Stack técnica decidida (linguagem, framework, arquitetura)
- [x] Padrão arquitetural definido
- [ ] Requisito de negócio documentado e aprovado pelo stakeholder responsável
- [ ] DoD acordado com o time de desenvolvimento

---

### DoD — Definition of Done

{lista base + adições contextuais da Fase 5 — um item por linha precedido de "-"}
\`\`\`

---

## Regras absolutas

- Faça **UMA pergunta por vez** nas fases 1–4. Nunca agrupe perguntas.
- "Não sei" ≠ "N/A": registre "A definir" para lacunas e "N/A" para campos inaplicáveis.
- Nunca marque \`[x]\` em critérios de DoR que requerem ação humana (aprovação, alinhamento de time).
- Performance P99 não se aplica a serviços assíncronos — avalie o contexto antes de usar.
- Out-of-scope deve ser derivado do contexto da ideia, não de defaults genéricos.
- **Nunca** implemente código. **Nunca** sugira implementações. Apenas elicite e documente a spec.
- O output final deve ser **somente** o conteúdo do arquivo \`.speckit/STORY-${nextId}.md\` — sem texto adicional além da confirmação de criação.
`;
}
