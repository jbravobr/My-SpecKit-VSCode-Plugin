# Fix 002

<!-- metadata
id: 002
title: Consumidor Kafka processa mensagem duplicada e gera cobrança duplicada
createdAt: 2026-01-20
version: 1
type: fix
status: open
-->

## Bug Description

### Título do Bug
Consumidor Kafka processa mensagem duplicada e gera cobrança duplicada

### Sintomas
O consumer do tópico pagamento.processado processa a mesma mensagem mais de uma vez quando há rebalanceamento do grupo, gerando cobranças duplicadas no DynamoDB.

### Passos para Reproduzir
- Publicar uma mensagem no tópico pagamento.processado
- Forçar rebalanceamento do grupo de consumers (reiniciar uma instância)
- Verificar a tabela Payments no DynamoDB

### Ambiente Afetado
Production — Java 21, Spring Boot 3.2, EKS

### Frequência de Ocorrência
intermitente — ocorre durante deploys e escalonamentos

---

## Root Cause Hypothesis

### Hipótese
O consumer não implementa idempotência baseada em messageId antes de persistir. O commit de offset acontece antes da persistência, causando reprocessamento em caso de falha.

### Arquivos/Componentes Suspeitos
- src/main/java/com/app/consumer/PaymentConsumer.java
- src/main/java/com/app/repository/PaymentRepository.java

---

## Impact Assessment

### Severidade
critical

### Usuários/Sistemas Afetados
Clientes com cobranças duplicadas — estimativa 0,3% das transações durante deploys

### Risco de Regressão
Alto — qualquer alteração no fluxo de commit de offset pode introduzir perda de mensagens

---

## Regression Prevention

### Testes a Adicionar
- Teste que verifica idempotência ao processar a mesma mensagem duas vezes
- Teste que simula rebalanceamento e verifica ausência de duplicatas no DynamoDB

---

## Contexto Técnico

### Messaging
Apache Kafka

### Banco de Dados / Cloud
DynamoDB

---

## DoF — Definition of Fixed

- [ ] Bug não reproduz mais com os passos documentados
- [ ] Root cause endereçado (não apenas patched)
- [ ] Testes de regressão adicionados e passando
- [ ] Cobertura ≥ 80%
- [ ] Commit local na branch `fix/002-<slug>`
