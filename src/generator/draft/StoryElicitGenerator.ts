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

## ⚠️ MODO PADRÃO: ENTREVISTA GUIADA — LEIA ANTES DE QUALQUER AÇÃO

**Você DEVE conduzir uma entrevista interativa, fase por fase.** Não gere o arquivo antes de concluir todas as fases.

- Sua **primeira mensagem** deve conter SOMENTE a pergunta 1.1 — nenhum outro texto, nenhum resumo, nenhum arquivo.
- Após cada resposta do usuário, faça a próxima pergunta da sequência — UMA por vez.
- A ideia inicial é apenas contexto de partida. Ela **não substitui** as respostas do usuário nas perguntas.
- **"Default se não informado"** ao longo deste prompt significa: o usuário foi perguntado e respondeu "não sei", "pula" ou omitiu a resposta. Nunca aplique um default sem ter feito a pergunta primeiro.
- **Exceção única:** se o usuário escrever "modo rápido", "preenche com defaults" ou equivalente → aplique a seção "Modo rápido" ao final deste prompt.

---

## Convenções desta entrevista

- **"Não sei"** → significa que a informação existe mas não foi fornecida: registre como lacuna explícita (ex: "A definir com o time"). Não aplique default silencioso.
- **"N/A"** → significa que o campo genuinamente não se aplica: registre como "N/A" e siga em frente.
- **Default** → aplicado apenas quando o usuário foi perguntado e respondeu "não sei" ou omitiu a resposta. O campo tem valor razoável de mercado. Sempre informe que está usando um default.
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
> Exemplo de output combinado: *"O cálculo de comissões é feito em batch noturno, gerando visibilidade defasada de D+1 para os vendedores — um ponto de atrito recorrente no fechamento mensal. A entrega é urgente porque o time comercial cresceu 40% este trimestre e o volume de reclamações no suporte sobre comissões incorretas triplicou desde janeiro."*

### 1.3 Valor \`(value)\`

Pergunta em duas partes — faça a primeira, aguarde, depois a segunda:

- Parte A: *"O que muda — e para quem — quando isso for entregue?"*
- Parte B: *"Como você vai saber que deu certo? Qual indicador ou métrica vai se mover?"*

Default se não informado:
- Parte A: derive da ideia inicial descrevendo o benefício operacional.
- Parte B: **não use "a definir após produção" como default** — sugira um candidato de métrica com base no domínio da ideia e peça confirmação:
  - Domínio de cálculo/financeiro → "Redução de divergências entre valor calculado e valor esperado (ex: tickets de suporte sobre erros de cálculo)"
  - Domínio de API/integração → "Latência P99 abaixo do SLA definido em 3.1 e taxa de erro < 0,1%"
  - Domínio de eventos/streaming → "Lag de fila < threshold definido e taxa de mensagens em DLQ < 1%"
  - Domínio de frontend/UX → "Taxa de conclusão do fluxo principal > X% e tempo médio de tarefa"
  - Domínio genérico → "Redução mensurável da dor descrita em 1.1 — sugerir proxy metric ao usuário e pedir confirmação"

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

**Sinal de tamanho** — avalie e informe o usuário antes de prosseguir:
- Apenas 1 user story identificada → *"Isso parece uma task, não uma story. Considere se faz mais sentido como subtarefa de uma story maior. Quer continuar como story mesmo assim?"*
- Mais de 5 user stories identificadas → *"Isso parece um épico. Considere dividir em histórias menores entregáveis independentemente. Quer priorizar as 3–5 mais importantes para esta story?"*

### 2.2 Critérios de Aceite \`(acceptanceCriteria)\`

Pergunta: *"Quais condições verificáveis provam que cada user story está funcionando? Inclua comportamentos do sistema, limites e casos de erro relevantes."*

Regras:
- Cada critério começa com verbo no infinitivo (Consumir, Persistir, Emitir, Rejeitar, Calcular, Validar, Retornar, Notificar)
- Deve ser mensurável e testável por um teste automatizado
- Cubra obrigatoriamente:
  - **Happy path**: o fluxo principal com dados válidos
  - **Limites de dados**: valor mínimo/máximo aceito, tamanho máximo de payload ou lista, comportamento com payload vazio ou nulo
  - **Rejeição**: pelo menos 1 caso em que o sistema deve rejeitar ou retornar erro (input inválido, pré-condição não atendida, recurso inexistente)
  - **Idempotência** se a operação for de escrita: re-execução com os mesmos dados produz o mesmo resultado sem efeito colateral
- Mínimo de 3 itens; ideal 5–7 para cobrir todos os quadrantes acima

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

**Sempre pergunte** — independentemente do que o usuário mencionou:
*"Este serviço será acessado por usuários autenticados, por sistemas internos via token, ou é uma operação pública sem autenticação?"*

Com base na resposta, complemente com:
- Se autenticado: *"Há requisitos de autorização por papel (RBAC) ou por recurso (ex: vendedor só vê suas próprias comissões)?"*
- Se dados pessoais envolvidos ou LGPD aplicável: adicione restrição explícita ao campo.
- Se público: adicione rate limiting e validação de input à especificação.

**Default base (sempre incluir):** "Nenhum dado pessoal (PII) nos logs. Credenciais via variáveis de ambiente. Inputs validados contra schema antes do processamento."

### 3.3 Escalabilidade \`(scalability)\`

Pergunta: *"Há estimativa de carga esperada — usuários simultâneos, requisições por hora, volume de eventos ou tamanho de payload? (ordem de grandeza é suficiente)"*

A partir da resposta, estruture o campo em duas partes claramente separadas:

**Parte 1 — Requisitos de código** (o que o time de desenvolvimento controla diretamente):
- Design stateless: nenhum estado de sessão ou contexto em memória entre requisições/execuções
- Paginação obrigatória em listas: limite máximo de itens por resposta (ex: 100 registros/página)
- Timeouts e circuit breakers em integrações externas: evitar cascata de falhas
- Pool de conexões configurável: não abrir conexão nova por requisição
- Operações de escrita assíncronas onde possível: não bloquear o fluxo principal
- Se houver estimativa de carga → adicionar: "Suportar [N] usuários simultâneos / [N] eventos/hora sem degradação de latência além do SLA definido em 3.1"

**Parte 2 — Recomendações de infraestrutura** (para discussão com o time de infra — fora do controle direto do desenvolvimento):
- Escalonamento horizontal habilitado pela ausência de estado local (pré-condição criada pelo código)
- Estratégia de autoscaling a definir com o time de infra com base nas métricas de carga coletadas em produção
- Limites de recursos (CPU/memória) a calibrar após primeira medição em produção

**Default se carga não informada:**
- Requisitos de código: stateless, paginação ≤ 100 itens, timeouts em integrações, pool de conexões
- Recomendações de infra: "Escalonamento horizontal a definir com o time de infra após baseline de produção"

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

**Sempre pergunte** — não infira silenciosamente. Sugira o default como opção baseada no contexto.

Pergunta: *"Qual padrão arquitetural? (hexagonal | layered | microservices | monolith | serverless). Com base no que descreveu, sugiro [sugestão] — confirma ou prefere outro?"*

Sugestão contextual:
- Lógica de domínio rica, múltiplos casos de uso, regras de negócio → sugerir "hexagonal"
- CRUD simples, scripts, utilitários, jobs → sugerir "layered"
- Serviço isolado com responsabilidade única → sugerir "microservices"
- Função cloud sem estado → sugerir "serverless"

Se o usuário não souber: aplique a sugestão contextual e informe que está fazendo isso.

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

Se o usuário não mencionar banco: "Nenhum banco de dados identificado na ideia inicial — confirmar se necessário."
Se o usuário disser "não sei" explicitamente: registre como "A definir com o time de arquitetura — lacuna identificada." (não aplique default; sinaliza que existe uma decisão pendente).

### 4.6 Infraestrutura \`(infrastructure)\`

Pergunta: *"Onde o serviço será implantado? (Kubernetes, Lambda, Docker, cloud provider)"*

Se não informado: "A definir — sem restrições de infraestrutura identificadas."
Se o usuário disser "não sei": registre como "A definir com o time de infra."

---

> **Resumo de fase**: "Stack definida: [linguagem] + [framework], arquitetura [padrão], target [tipo]. Confirma?"

---

## FASE 5 — Dependências e DoR/DoD

### 5.0 Dependências Externas \`(problem — complemento de contexto)\`

Pergunta: *"Esta história depende de outra feature, ticket ou serviço externo que ainda não está disponível ou pronto? (ex: API de terceiro, schema de banco pendente, outra story do mesmo sprint)"*

Default se não informado: "Nenhuma dependência bloqueante identificada."

> **Instrução de montagem**: se houver dependências, registre-as ao final do campo \`Problema\` como um parágrafo separado: "Dependências: {lista}."

### DoR — Definition of Ready

Avalie cada critério individualmente após preencher as fases anteriores.

**Critérios verificáveis pelo AI** — marque \`[x]\` **somente se o dado foi efetivamente coletado** durante a entrevista (resposta do usuário ou default aplicado com confirmação). Se o campo ficou como "A definir" ou "não sei", mantenha \`[ ]\`:
- [ ] User stories com critérios de aceite mensuráveis ← marque [x] se 2.1 e 2.2 foram preenchidos
- [ ] Escopo delimitado (o que está e o que não está incluído) ← marque [x] se 2.3 foi preenchido
- [ ] Requisitos não-funcionais definidos (performance, segurança, disponibilidade) ← marque [x] se 3.1–3.5 foram resolvidos (não "A definir")
- [ ] Stack técnica decidida (linguagem, framework, arquitetura) ← marque [x] se 4.1–4.3 foram respondidos ou defaultados com confirmação
- [ ] Padrão arquitetural definido ← marque [x] se 4.3 foi confirmado

**Critérios que requerem ação humana** (mantenha sempre como \`[ ]\` — jamais marque automaticamente):
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

{avalie cada critério individualmente conforme regra da Fase 5 — marque [x] somente para dados efetivamente coletados}
- [ ] User stories com critérios de aceite mensuráveis
- [ ] Escopo delimitado (o que está e o que não está incluído)
- [ ] Requisitos não-funcionais definidos (performance, segurança, disponibilidade)
- [ ] Stack técnica decidida (linguagem, framework, arquitetura)
- [ ] Padrão arquitetural definido
- [ ] Requisito de negócio documentado e aprovado pelo stakeholder responsável
- [ ] DoD acordado com o time de desenvolvimento

---

### DoD — Definition of Done

{lista base + adições contextuais da Fase 5 — um item por linha precedido de "-"}
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

4. Confirme: "✅ Spec gerada com defaults. Revise os campos listados acima antes de rodar \`@speckit /validate\`."

## Regras absolutas

- Faça **UMA pergunta por vez** nas fases 1–4. Nunca agrupe perguntas.
- "Não sei" ≠ "N/A": registre "A definir" para lacunas e "N/A" para campos inaplicáveis.
- Nunca marque \`[x]\` em critérios de DoR que não foram efetivamente coletados ou que requerem ação humana.
- Performance P99 não se aplica a serviços assíncronos — avalie o contexto antes de usar.
- Escalabilidade: requisitos de código primeiro; infraestrutura como recomendação, nunca como prescrição.
- Out-of-scope deve ser derivado do contexto da ideia, não de defaults genéricos.
- KPI de sucesso: sugira um candidato com base no domínio — não defira para "após produção".
- **Nunca** implemente código. **Nunca** sugira implementações. Apenas elicite e documente a spec.
- O output final deve ser **somente** o conteúdo do arquivo \`.speckit/STORY-${nextId}.md\` — sem texto adicional além da confirmação de criação (exceto no modo rápido).
`;
}
