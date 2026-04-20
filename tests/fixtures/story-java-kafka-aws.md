# História 002

<!-- metadata
id: 002
title: Processador de eventos de pagamento via Kafka
createdAt: 2026-01-20
version: 1
type: story
status: open
-->

---

## Requisito de Negócio

### Problema

Eventos de pagamento são processados em batch com latência de D+1.

### Valor

Processamento em tempo real reduz latência para segundos e habilita dashboards ao vivo.

### Stakeholders

- Time Financeiro (fechamento em tempo real)
- Plataforma de Dados (consumo dos eventos processados)

---

## Especificação Funcional

### User Stories

- Como sistema, ao receber um evento Kafka de pagamento, quero processar e persistir o resultado

### Critérios de Aceite

- Consumir eventos do tópico pagamentos.v1
- Persistir resultado na tabela pagamentos do Aurora MySQL
- Evento inválido encaminhado à DLQ com header de causa

### Fora de Escopo

- Dashboard de visualização
- Estorno de pagamentos

---

## Especificação Não-Funcional

### Performance

P99 < 500ms por evento.

### Segurança

Nenhum PII nos logs.

### Escalabilidade

Escalonamento horizontal via consumer group.

### Usabilidade

N/A

### Disponibilidade

99,5% uptime. Retry com backoff exponencial antes de DLQ.

---

## Especificação Técnica

### Linguagem

java

### Framework

springboot

### Arquitetura

hexagonal

### Target

backend

### Banco de Dados

Aurora MySQL 8.0

### Infraestrutura

Apache Kafka (AWS MSK), AWS ECS

### CI

github-actions

---

## DoR — Definition of Ready

- [x] Requisito de negócio documentado e aprovado
- [x] User stories com critérios de aceite mensuráveis
- [x] Escopo delimitado (o que está e o que não está incluído)
- [x] Requisitos não-funcionais definidos
- [x] Stack técnica decidida
- [x] Padrão arquitetural definido
- [x] DoD acordado com o time

---

## DoD — Definition of Done

- Todos os critérios de aceite validados por testes automatizados
- Cobertura de testes ≥ 80%
- Code review aprovado
- Documentação atualizada
- Deploy em ambiente de homologação validado
