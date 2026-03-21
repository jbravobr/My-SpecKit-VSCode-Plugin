export function generateStoryTemplate(id: string): string {
  const now = new Date().toISOString().split('T')[0];
  return `# História ${id}

<!-- metadata
id: ${id}
title: <!-- TODO: Título curto e descritivo. Ex: "Cálculo de comissão a partir de eventos Kafka" -->
createdAt: ${now}
version: 1
type: story
status: open
-->

---

## Requisito de Negócio

### Problema
<!-- TODO: Qual dor ou ineficiência esta história resolve?
     Ex: "O cálculo de comissões é feito em batch noturno, gerando visibilidade
     defasada de D+1 para o time comercial e atrasando o fechamento financeiro." -->

### Valor
<!-- TODO: O que muda — e para quem — quando esta história for entregue?
     Ex: "Cálculo em tempo real elimina o lag de D+1, habilita dashboards ao vivo
     para o time comercial e antecipa em até 24h o fechamento financeiro mensal." -->

### Stakeholders
<!-- TODO: Quem é impactado ou tem interesse no resultado? Um por linha.
     Ex:
- Time Comercial (visibilidade em tempo real)
- Financeiro (fechamento mensal mais rápido)
- Plataforma de Dados (consumo do evento de saída) -->
-

---

## Especificação Funcional

### User Stories
<!-- TODO: Formato: "Como [ator], quero [ação] para [benefício]". Uma por linha.
     Ex:
- Como sistema, ao receber um evento de movimentação, quero calcular a comissão para que o resultado esteja disponível em tempo real
- Como sistema, quero persistir a comissão calculada para que o histórico seja auditável
- Como sistema, quero emitir um evento de resultado para que consumidores downstream sejam notificados -->
-

### Critérios de Aceite
<!-- TODO: Condições mensuráveis e verificáveis — cada item deve poder virar um teste. Uma por linha.
     Ex:
- Consumir eventos do tópico Kafka "movimentacoes.v1" com schema { id, vendedorId, valor, categoriaId }
- Classificar cada movimentação em exatamente um tipo de regra: TAXA_FIXA, ESCALONADA, COM_TETO ou BONUS
- Processar movimentação duplicada (mesmo id) de forma idempotente — sem duplicar registro
- Persistir na tabela "comissoes": (id, movimentacao_id, vendedor_id, tipo_regra, valor_comissao, calculado_em)
- Emitir evento no tópico "comissoes.calculadas.v1" com schema { comissaoId, movimentacaoId, valorComissao }
- Evento inválido deve ser encaminhado para DLQ com a causa do erro no header -->
-

### Fora de Escopo
<!-- TODO: O que explicitamente NÃO será feito nesta história? Evita expansão de escopo. Uma por linha.
     Ex:
- Pagamento das comissões calculadas
- API REST de consulta de comissões
- Recálculo retroativo de movimentações já processadas
- Configuração das regras de comissão via interface -->
-

---

## Especificação Não-Funcional

### Performance
<!-- TODO: SLA mensurável. Ex: "P99 < 300ms por evento, do consumo até a emissão do evento de saída.
     Capacidade de 1.000 eventos/minuto por partição sem degradação." -->

### Segurança
<!-- TODO: Restrições de segurança aplicáveis. Ex: "Nenhum dado pessoal (PII) nos logs.
     Payload validado contra schema antes do processamento. Credenciais via variáveis de ambiente." -->

### Escalabilidade
<!-- TODO: Como o sistema deve se comportar sob crescimento de carga.
     Ex: "Escalonamento horizontal via consumer group: adicionar instâncias aumenta o throughput
     proporcionalmente ao número de partições (10 partições configuradas)." -->

### Usabilidade
<!-- TODO: Expectativas de UX quando aplicável. Para serviços system-to-system: "N/A".
     Ex (interface): "Feedback visual imediato em todas as ações; mensagens de erro descritivas." -->

### Disponibilidade
<!-- TODO: Uptime esperado e comportamento em falha. Ex: "99,5% uptime. Falhas transitórias
     acionam retry com backoff exponencial (3 tentativas, backoff inicial 500ms) antes do DLQ." -->

---

## Especificação Técnica

### Linguagem
<!-- TODO: Escolha exatamente um: typescript | javascript | java | csharp | python -->

### Framework
<!-- TODO: Escolha exatamente um: dotnet | springboot | angular | react | fastapi | other -->

### Arquitetura
<!-- TODO: Escolha exatamente um: hexagonal | layered | microservices | monolith | serverless -->

### Target
<!-- TODO: Escolha exatamente um: backend | frontend | fullstack | script | library -->

### Banco de Dados
<!-- TODO: Tecnologia e versão. Ex: "PostgreSQL 15 (tabela comissoes); tabelas de configuração já existentes." -->

### Infraestrutura
<!-- TODO: Onde e como o serviço roda. Ex: "Apache Kafka (AWS MSK), Docker, Kubernetes (EKS),
     CI/CD via GitHub Actions." -->

---

## DoR — Definition of Ready

<!-- TODO: Marque com [x] os critérios já atendidos. Todos devem estar marcados antes de implementar. -->
- [ ] Requisito de negócio documentado e aprovado
- [ ] User stories com critérios de aceite mensuráveis
- [ ] Escopo delimitado (o que está e o que não está incluído)
- [ ] Requisitos não-funcionais definidos
- [ ] Stack técnica decidida
- [ ] Padrão arquitetural definido
- [ ] DoD acordado com o time

---

## DoD — Definition of Done

<!-- TODO: Condições que definem "pronto para produção". Adapte ao contexto da história. Uma por linha. -->
- Todos os critérios de aceite validados por testes automatizados
- Cobertura de testes ≥ 80%
- Code review aprovado
- Documentação atualizada
- Deploy em ambiente de homologação validado
`;
}
