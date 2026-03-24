# História 003

<!-- metadata
id: 003
title: BFF de pedidos para o app mobile
createdAt: 2026-01-20
version: 1
type: story
status: open
-->

---

## Requisito de Negócio

### Problema
O app mobile faz múltiplas chamadas a serviços diferentes para montar a tela de pedidos.

### Valor
BFF agrega e formata os dados, reduzindo o número de roundtrips do mobile.

### Stakeholders
- Time Mobile (redução de roundtrips)
- Time de Plataforma (simplificação do client)

---

## Especificação Funcional

### User Stories
- Como BFF, quero agregar dados de pedidos, itens e status em uma única resposta

### Critérios de Aceite
- Endpoint GET /api/pedidos/{id} retorna pedido completo
- Chamadas aos serviços downstream em paralelo
- Erros downstream normalizados para RFC 7807

### Fora de Escopo
- Criação de pedidos
- Cancelamento de pedidos

---

## Especificação Não-Funcional

### Performance
P99 < 300ms incluindo fan-out aos serviços downstream.

### Segurança
Token relay para todos os serviços downstream.

### Escalabilidade
Stateless — escalonamento horizontal sem estado.

### Usabilidade
N/A

### Disponibilidade
99,9% uptime. Circuit breaker em cada integração downstream.

---

## Especificação Técnica

### Linguagem
java

### Framework
springboot

### Arquitetura
hexagonal

### Target
bff

### Banco de Dados
NA

### Infraestrutura
AWS ECS

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
