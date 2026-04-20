import { WorkspaceDefaults } from '../../config/WorkspaceDefaults';
import { SpecType } from '../../story/Story';

const TYPE_LABELS: Record<SpecType, string> = {
  story: 'História',
  refactoring: 'Refactoring',
  spike: 'Spike / PoC',
};

function buildDefaultsContext(defaults: WorkspaceDefaults | undefined): string {
  if (!defaults || Object.keys(defaults).length === 0) return '';
  const lines: string[] = ['## Defaults do workspace (pré-carregados)', ''];
  if (defaults.language) lines.push(`- **Linguagem:** ${defaults.language}`);
  if (defaults.framework) lines.push(`- **Framework:** ${defaults.framework}`);
  if (defaults.architecture) lines.push(`- **Arquitetura:** ${defaults.architecture}`);
  if (defaults.target) lines.push(`- **Target:** ${defaults.target}`);
  if (defaults.projectStage) lines.push(`- **Estágio:** ${defaults.projectStage}`);
  if (defaults.database) lines.push(`- **Database:** ${defaults.database}`);
  if (defaults.infrastructure) lines.push(`- **Infraestrutura:** ${defaults.infrastructure}`);
  if (defaults.ci) lines.push(`- **CI:** ${defaults.ci}`);
  lines.push(
    '',
    '> Use estes valores como default na Fase 4 (Especificação Técnica). Se o usuário confirmar ou omitir, aplique-os diretamente.',
    '',
  );
  return lines.join('\n');
}

function buildTypeContext(specType: SpecType): string {
  if (specType === 'refactoring') {
    return `## Tipo: Refactoring

> Esta spec é um **refactoring** — melhoria interna sem mudança de comportamento externo.
> Adapte as perguntas: foco em debt técnico, métricas de qualidade, área de impacto.
> User stories não se aplicam — use "Escopo da Refatoração" no lugar.
> Critérios de aceite focam em: mesmos testes passando, métricas melhoradas, zero regressão.

`;
  }
  if (specType === 'spike') {
    return `## Tipo: Spike / PoC

> Esta spec é um **spike** — investigação técnica com deliverable de conhecimento.
> Adapte as perguntas: foco em hipótese, critérios de viabilidade, timebox.
> O output não é software de produção — é um documento de decisão.
> Critérios de aceite focam em: hipótese validada/invalidada, recomendação documentada.

`;
  }
  return '';
}

export function generateStoryElicitPrompt(
  roughInput: string,
  nextId: string,
  specType: SpecType = 'story',
  defaults?: WorkspaceDefaults,
): string {
  const typeLabel = TYPE_LABELS[specType];
  const defaultsCtx = buildDefaultsContext(defaults);
  const typeCtx = buildTypeContext(specType);

  return `# Elicit ${typeLabel} — STORY-${nextId}

> Você é um analista de produto e arquiteto de software sênior.
> Seu objetivo é transformar a ideia abaixo em uma ${typeLabel.toLowerCase()} SDD completa,
> salva em \`.speckit/STORY-${nextId}.md\`.
>
> **Não escreva código. Não implemente nada. Apenas elicite e documente a spec.**

## Ideia inicial do usuário

> ${roughInput}

${typeCtx}${defaultsCtx}---

## ⚠️ REGRA MESTRE — LEIA ANTES DE QUALQUER AÇÃO

**Uma mensagem = uma pergunta. Sua mensagem termina quando você faz a pergunta.**

- Faça UMA pergunta por vez. Não derive a resposta. Não encadeie perguntas. Não faça a próxima pergunta.
- Após escrever a pergunta, sua mensagem está COMPLETA. Não escreva mais nada.
- Nunca responda sua própria pergunta — nem explicitamente ("Sim"), nem implicitamente (derivando uma resposta).
- Nunca aplique um default sem ter feito a pergunta E recebido resposta do usuário.
- **Se uma pergunta já foi respondida nesta conversa, NUNCA a repita.** Avance para a próxima pergunta da sequência. Isso vale para sub-perguntas (ex: 1.3a, 1.3b) — cada uma é respondida uma única vez.
- **Exceção única:** se o usuário escrever "modo rápido", "preenche com defaults" ou equivalente → vá para a seção "Modo rápido" ao final deste prompt.

**Sequência obrigatória para cada campo:**
1. Você faz a pergunta → **SUA MENSAGEM TERMINA**
2. Usuário responde
3. Você registra a resposta e faz a próxima pergunta → **SUA MENSAGEM TERMINA**

**Início obrigatório:** Ao receber qualquer mensagem inicial que não seja "modo rápido" — comece diretamente com a pergunta 1.1. Não apresente menus, não explique o processo, não pergunte sobre o modo de operação.

---

## Convenções desta entrevista

- **"Não sei"** → registre como "A definir com o time". Não aplique default.
- **"N/A"** → registre como "N/A" e siga em frente.
- **"Pular"** → registre o campo como "<!-- TODO: A ser preenchido -->" e avance para a próxima pergunta. O campo ficará como lacuna para o \`/validate\` detectar.
- **Default** → aplicado somente quando o usuário foi perguntado e omitiu a resposta. Informe que está usando um default.
- Ao final de cada fase, apresente um resumo de 2–3 linhas do que foi capturado e pergunte se está correto. Sua mensagem termina aí — aguarde confirmação antes de avançar.

---

## FASE 1 — Requisito de Negócio

### 1.1 Problema \`(problem)\`

Pergunta para o usuário:
*"Qual dor, ineficiência ou lacuna esta funcionalidade resolve? Quem sente essa dor hoje e com qual frequência?"*

Default (aplique somente após perguntar e o usuário omitir): derive da ideia inicial reformulando como enunciado de problema objetivo.

### 1.2 Por que agora? \`(problem — complemento)\`

Pergunta para o usuário:
*"O que torna esta entrega urgente ou relevante neste momento? Há prazo, evento externo, pressão de stakeholder ou volume de suporte que justifique priorizar agora?"*

Default (aplique somente após perguntar e o usuário omitir): "Motivação de urgência não especificada — priorização a ser alinhada com o time de produto."

> **Instrução de montagem**: combine 1.1 e 1.2 em um único parágrafo coeso no campo \`Problema\` do template de saída.

### 1.3a Valor — benefício \`(value)\`

Pergunta para o usuário:
*"O que muda — e para quem — quando isso for entregue?"*

Default (aplique somente após perguntar e o usuário omitir): derive da ideia inicial descrevendo o benefício operacional.

### 1.3b Valor — métrica \`(value)\`

Pergunta para o usuário:
*"Como você vai saber que deu certo? Qual indicador ou métrica vai se mover?"*

**Importante:** não use "a definir após produção" como default.

Default (aplique somente após perguntar e o usuário omitir): sugira UMA métrica concreta derivada do domínio descrito pelo usuário nas respostas anteriores. A métrica deve ser mensurável e específica ao contexto — não use templates genéricos.

### 1.4 Stakeholders \`(stakeholders)\`

Pergunta para o usuário:
*"Quem é impactado ou tem interesse no resultado? Liste times, sistemas dependentes e usuários finais."*

Default (aplique somente após perguntar e o usuário omitir): ["Time de Produto", "Usuários finais"].

---

**→ Resumo da Fase 1:** após receber a resposta de 1.4, apresente um resumo de 2–3 linhas do requisito de negócio capturado e pergunte: *"Está correto? Posso avançar para as user stories?"*
Sua mensagem termina aqui. Aguarde a confirmação do usuário.

> **Instruções de montagem da Fase 1** (aplique ao montar o arquivo final, NÃO durante a entrevista):
> - Combine 1.1 e 1.2 em um único parágrafo coeso no campo \`Problema\`.
> - Combine 1.3a e 1.3b em um único parágrafo no campo \`Valor\`.
> - Exemplo de Problema combinado: *"O cálculo de comissões é feito em batch noturno, gerando visibilidade defasada de D+1 para os vendedores — um ponto de atrito recorrente no fechamento mensal. A entrega é urgente porque o time comercial cresceu 40% este trimestre e o volume de reclamações no suporte sobre comissões incorretas triplicou desde janeiro."*

---

## FASE 2 — Especificação Funcional

### 2.1 User Stories \`(userStories)\`

Pergunta para o usuário:
*"Quais são as ações que um usuário ou sistema externo executa? Use: Como [ator com objetivo], quero [ação] para [benefício]."*

Regras de validação (aplique após receber a resposta):
- Ator deve ser humano ou sistema externo com objetivo de negócio
- **Evite "sistema" como ator**: comportamentos puramente internos não são user stories — são critérios de aceite. Se o usuário sugerir "Como sistema, quero consumir...", oriente: *"Esse comportamento interno é melhor como critério de aceite. Qual a perspectiva do usuário externo que desencadeia isso?"*

**Sinal de tamanho** — avalie e informe o usuário após receber as stories:
- Apenas 1 user story identificada → *"Isso parece uma task, não uma story. Considere se faz mais sentido como subtarefa de uma story maior. Quer continuar como story mesmo assim?"*
- Mais de 5 user stories identificadas → *"Isso parece um épico. Considere dividir em histórias menores entregáveis independentemente. Quer priorizar as 3–5 mais importantes para esta story?"*

Default (aplique somente após perguntar e o usuário omitir): derive 2–3 user stories da ideia inicial com atores e objetivos claros.

### 2.2 Critérios de Aceite \`(acceptanceCriteria)\`

Pergunta para o usuário:
*"Quais condições verificáveis provam que cada user story está funcionando? Inclua o fluxo principal, limites de dados e pelo menos um caso de erro ou rejeição."*

Regras de validação (aplique após receber a resposta):
- Cada critério começa com verbo no infinitivo (Consumir, Persistir, Emitir, Rejeitar, Calcular, Validar, Retornar, Notificar)
- Deve cobrir obrigatoriamente:
  - **Happy path**: o fluxo principal com dados válidos
  - **Limites de dados**: valor mínimo/máximo aceito, tamanho máximo de payload, comportamento com payload vazio ou nulo
  - **Rejeição**: pelo menos 1 caso em que o sistema deve rejeitar ou retornar erro
  - **Idempotência** se operação de escrita: re-execução com os mesmos dados produz o mesmo resultado sem efeito colateral
- Mínimo de 3 itens; ideal 5–7

Default (aplique somente após perguntar e o usuário omitir): derive 3–5 critérios das user stories cobrindo happy path + 1 caso de rejeição.

### 2.3 Fora de Escopo \`(outOfScope)\`

Pergunta para o usuário:
*"O que explicitamente NÃO será feito nesta história? Pense nas extensões óbvias que alguém poderia pedir depois."*

Default (aplique somente após perguntar e o usuário omitir): derive 3 itens das user stories identificando extensões naturais do escopo e excluindo-as explicitamente.

---

**→ Resumo de fase:** após receber a resposta de 2.3, apresente um resumo indicando quantas user stories, critérios de aceite e itens fora de escopo foram capturados, e pergunte: *"Está correto? Posso avançar para os requisitos não-funcionais?"*
Sua mensagem termina aqui. Aguarde a confirmação do usuário.

---

## FASE 3 — Especificação Não-Funcional

Pergunte cada campo individualmente. Aplique o default **somente** se o usuário responder "não sei", omitir ou confirmar explicitamente.

### 3.1 Performance \`(performance)\`

Pergunta para o usuário:
*"Qual é o requisito de performance? (ex: P99 < 200ms, throughput mínimo, latência máxima)"*

Default (aplique somente se o usuário não souber):
- Ideia menciona processamento assíncrono, batch, consumer, pipeline ou job → "Processamento assíncrono — SLA de latência não aplicável. Monitorar throughput e lag de fila."
- Ideia menciona API, endpoint ou requisição síncrona → "P99 < 500ms. Throughput sem restrição definida."

---

### 3.2 Segurança \`(security)\`

Pergunta para o usuário:
*"Este serviço será acessado por usuários autenticados, por sistemas internos via token, ou é uma operação pública sem autenticação?"*

Default (aplique somente se o usuário não souber): "Nenhum dado pessoal (PII) nos logs. Credenciais via variáveis de ambiente. Inputs validados contra schema antes do processamento."

Se a ideia mencionar dados pessoais ou LGPD, adicione restrição explícita ao default.

---

### 3.3 Escalabilidade \`(scalability)\`

Pergunta para o usuário:
*"Há requisitos específicos de escalabilidade ou volume esperado de requisições/eventos?"*

Default (aplique somente se o usuário não souber):
- **Requisitos de código**: stateless, paginação ≤ 100 itens, timeouts em integrações, pool de conexões configurável
- **Recomendações de infraestrutura**: Escalonamento horizontal habilitado pela ausência de estado local. Autoscaling e limites de CPU/memória a calibrar com o time de infra após baseline de produção.

---

### 3.4 Usabilidade \`(usability)\`

Avalie o contexto antes de perguntar:
- Se a ideia descreve API, serviço, consumer, batch, job ou qualquer coisa sem interface visual → registre "N/A" **sem perguntar**.
- Se a ideia menciona UI, tela, dashboard, frontend, mobile ou app → pergunte: *"Há requisitos de usabilidade ou acessibilidade? (ex: WCAG 2.1, suporte a leitores de tela, idiomas)"*

Default (aplique somente se perguntou e o usuário não soube): "A definir com o time de UX."

---

### 3.5 Disponibilidade \`(availability)\`

Pergunta para o usuário:
*"Qual é o requisito de disponibilidade? (ex: 99,9% uptime, RTO/RPO específico)"*

Default (aplique somente se o usuário não souber): "99,5% uptime. Falhas transitórias acionam retry com backoff exponencial (3 tentativas, 500ms inicial) antes do DLQ ou retorno de erro."

---

**→ Resumo de fase 3:** após coletar os 5 campos, apresente um resumo compacto e pergunte se está correto.

Sua mensagem termina aqui. Aguarde a confirmação antes de avançar para a Fase 4.

---

## FASE 4 — Especificação Técnica

### 4.1 Linguagem \`(language)\`

Pergunta para o usuário:
*"Qual linguagem de programação? (typescript | javascript | java | csharp | python)"*

Sugestão contextual (mencione como sugestão, não imponha):
- Kafka + microserviço → java ou typescript
- ML / dados → python
- Web frontend → typescript

Default (aplique somente após perguntar e o usuário omitir): "typescript"

### 4.2 Framework \`(framework)\`

Pergunta para o usuário:
*"Qual framework? (dotnet | springboot | angular | react | fastapi | other)"*

Default por linguagem (aplique somente após perguntar e o usuário omitir): typescript → other | java → springboot | python → fastapi | csharp → dotnet

### 4.3 Arquitetura \`(architecture)\`

**Sempre pergunte** — não infira silenciosamente. Avalie o contexto, formule uma sugestão e apresente ao usuário para confirmação:
- Lógica de domínio rica, múltiplos casos de uso → sugerir "hexagonal"
- CRUD simples, scripts, jobs → sugerir "layered"
- Serviço isolado com responsabilidade única → sugerir "microservices"
- Função cloud sem estado → sugerir "serverless"

Pergunta para o usuário:
*"Qual padrão arquitetural? (hexagonal | layered | microservices | monolith | serverless). Com base no que descreveu, sugiro [sugestão contextual] — confirma ou prefere outro?"*

Default (aplique somente após perguntar e o usuário omitir): aplique a sugestão contextual e informe que está fazendo isso.

### 4.4 Target \`(target)\`

Avalie automaticamente — não pergunte:
- API / REST / GraphQL / banco → "backend"
- React / Angular / UI / tela → "frontend"
- BFF / gateway / proxy → "bff"
- Kafka / consumer / producer → "backend"
- Lambda / function / trigger → "script"
- SDK / biblioteca → "library"

Fallback (quando nenhum sinal identificado): "backend"

### 4.5 Banco de Dados \`(database)\`

Pergunta para o usuário:
*"Qual banco de dados será utilizado? (tecnologia + propósito)"*

Se a ideia não mencionar banco: pergunte *"Não identifiquei banco de dados na ideia inicial — há algum banco de dados envolvido nesta história?"*. Se confirmar que não há: registre "Nenhum banco de dados identificado."
Se o usuário disser "não sei": registre "A definir com o time de arquitetura — lacuna identificada."

**Regra**: ao não mencionar banco na ideia inicial, não assuma que não existe — sempre confirme explicitamente.

### 4.6 Infraestrutura \`(infrastructure)\`

Pergunta para o usuário:
*"Onde o serviço será implantado? (ex: Kubernetes, Lambda, Docker, AWS, Azure, GCP)"*

Se a ideia não mencionar infra: pergunte mesmo assim — *"Não identifiquei restrições de infraestrutura na ideia inicial — há alguma plataforma ou ambiente definido para o deploy?"*. Se confirmar que não há: registre "Não definida."
Se o usuário disser "não sei": registre "Não definida."

**Regra**: ao não mencionar infraestrutura na ideia inicial, não assuma que não existe — sempre confirme explicitamente.

### 4.7 Estágio do Projeto \`(projectStage)\`

Pergunta para o usuário:
*"Este projeto é greenfield (novo, sem código existente) ou brownfield (projeto existente, com código e convenções já estabelecidas)?"*

Default (aplique somente após perguntar e o usuário omitir): "brownfield"

### 4.8 CI \`(ci)\`

Pergunta para o usuário:
*"Deseja gerar workflows de CI/CD para GitHub Actions? (github-actions | none)"*

Default (aplique somente após perguntar e o usuário omitir): "github-actions"

---

**→ Resumo de fase:** após receber a resposta de 4.8, apresente um resumo com a stack definida (linguagem + framework + arquitetura + target + estágio + CI) e pergunte: *"Está correto? Posso avançar para dependências e critérios de pronto?"*
Sua mensagem termina aqui. Aguarde a confirmação do usuário.

---

## FASE 5 — Dependências e DoR/DoD

### 5.0 Dependências Externas

Pergunta para o usuário:
*"Esta história depende de outra feature, ticket ou serviço externo que ainda não está disponível? (ex: API de terceiro, schema de banco pendente, outra story do mesmo sprint)"*

Default (aplique somente após perguntar e o usuário omitir): "Nenhuma dependência bloqueante identificada."

> **Instrução de montagem**: se houver dependências, registre-as ao final do campo \`Problema\` como parágrafo separado: "Dependências: {lista}."

### DoD — Definition of Done

Pergunta para o usuário:
*"Quais condições definem 'pronto para produção' neste contexto? (além dos critérios base de testes e code review)"*

Base obrigatória (sempre incluir independentemente da resposta):
- Todos os critérios de aceite validados por testes automatizados
- Cobertura de testes ≥ 80%
- Code review aprovado por pelo menos 1 revisor
- Deploy em ambiente de homologação validado

Adições contextuais (inclua com base no target e tecnologias da Fase 4, sem perguntar):
- target "backend" com endpoint exposto → "Contrato de API (OpenAPI/schema) atualizado"
- target "frontend" → "Acessibilidade WCAG 2.1 AA verificada" e "Testado nos browsers suportados"
- Kafka/consumer → "Offset lag e DLQ rate monitorados e abaixo do threshold definido"
- Mudança de schema de banco → "Migration idempotente validada em staging"
- Funcionalidade de segurança → "Scan SAST sem findings críticos"

---

**→ Após receber a resposta de DoD:** avance diretamente para a Fase 6 (montagem final). Não peça confirmação adicional.

---

## FASE 6 — Montagem Final

Após coletar todas as respostas (ou aplicar os defaults onde aplicável e informado):

1. Monte o documento completo usando o template abaixo
2. Substitua **todos** os campos pelos valores coletados — nunca deixe um campo em branco
3. Combine 1.1 + 1.2 em um único parágrafo coeso no campo \`Problema\`
4. Combine 1.3a + 1.3b em um único parágrafo coeso no campo \`Valor\`
5. **DoR**: avalie cada critério individualmente:
   - **Critérios verificáveis pelo AI**: marque \`[x]\` somente se o dado foi efetivamente coletado (resposta do usuário ou default aplicado e informado)
   - **Critérios que requerem ação humana** (aprovação de stakeholder, alinhamento com o time): mantenha sempre \`[ ]\`
6. Crie o arquivo \`.speckit/STORY-${nextId}.md\` com o conteúdo completo usando a ferramenta de criação de arquivo
7. Após criar o arquivo, confirme: "✅ Arquivo \`.speckit/STORY-${nextId}.md\` criado com sucesso. Use \`@speckit /validate\` para verificar completude e gerar a configuração do Copilot."

### Template de saída

\`\`\`markdown
<!-- metadata
id: ${nextId}
title: {título derivado da ideia inicial — conciso, orientado ao valor de negócio}
createdAt: {data de hoje no formato YYYY-MM-DD}
version: 1
type: ${specType}
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
{lista de 2.3 — um item por linha precedido de "-"}

---

### Especificação Não-Funcional

#### Performance
{valor de 3.1}

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

#### Estágio do Projeto
{valor de 4.7: greenfield | brownfield}

#### CI
{valor de 4.8: github-actions | none}

---

### DoR — Definition of Ready

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

---

## Regras absolutas

- **Uma mensagem = uma pergunta.** Sua mensagem termina quando você faz a pergunta. Não derive, não encadeie, não responda.
- **Nunca aplique um default sem ter feito a pergunta primeiro** (exceto: 4.4 Target, avaliado contextualmente; adições contextuais do DoD).
- **Nunca responda sua própria pergunta.** "Está correto?", "Confirma?", "Posso avançar?" — todas exigem resposta do usuário, não sua.
- "Não sei" ≠ "N/A": registre "A definir" para lacunas e "N/A" para campos genuinamente inaplicáveis.
- Nunca marque \`[x]\` em critérios de DoR que não foram efetivamente coletados ou que requerem ação humana.
- Performance P99 não se aplica a serviços assíncronos — avalie antes de usar.
- Out-of-scope deve ser derivado do contexto da ideia, não de defaults genéricos.
- **Nunca** implemente código. **Nunca** sugira implementações. Apenas elicite e documente a spec.
- O output final deve ser **somente** o conteúdo do arquivo \`.speckit/STORY-${nextId}.md\` — sem texto adicional além da confirmação de criação.
`;
}
