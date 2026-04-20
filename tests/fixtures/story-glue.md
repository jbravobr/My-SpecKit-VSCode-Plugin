# História 004

<!-- metadata
id: 004
title: ETL de relatório financeiro via GlueJob
createdAt: 2026-01-20
version: 1
type: story
status: open
-->

---

## Requisito de Negócio

### Problema

O relatório financeiro mensal é gerado manualmente com alto risco de erro.

### Valor

ETL automatizado elimina erros manuais e reduz o tempo de geração de 4h para 15min.

### Stakeholders

- Time Financeiro (precisão e velocidade do relatório)

---

## Especificação Funcional

### User Stories

- Como sistema, quero processar os dados financeiros do mês e gerar o relatório em S3

### Critérios de Aceite

- Ler dados particionados por mês do Glue Catalog
- Aplicar regras de agregação e transformação
- Escrever resultado em S3 particionado por ano/mês

### Fora de Escopo

- Envio automático do relatório por email
- Visualização interativa

---

## Especificação Não-Funcional

### Performance

Processamento completo em menos de 15 minutos.

### Segurança

Nenhuma credencial no script. IAM role do job.

### Escalabilidade

Spark distribui o processamento automaticamente.

### Usabilidade

N/A

### Disponibilidade

Execução agendada mensal. Falhas alertam via CloudWatch.

---

## Especificação Técnica

### Linguagem

python

### Framework

other

### Arquitetura

serverless

### Target

script

### Banco de Dados

NA

### Infraestrutura

AWS GlueJob, S3, Glue Catalog

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
