export function generateFixTemplate(id: string): string {
  const now = new Date().toISOString().split('T')[0];
  return `# Fix ${id}

<!-- metadata
id: ${id}
title: <!-- TODO -->
createdAt: ${now}
version: 1
type: fix
status: open
gate: 0
-->

## Bug Description

### Título do Bug
<!-- TODO -->

### Sintomas
<!-- TODO: descreva o comportamento incorreto observado -->

### Passos para Reproduzir
<!-- TODO:
- Passo 1
- Passo 2
-->
-

### Ambiente Afetado
<!-- TODO: versão, OS, browser, ambiente (prod/staging/local) -->

### Frequência de Ocorrência
<!-- TODO: sempre | intermitente | apenas em condição X -->

---

## Root Cause Hypothesis

### Hipótese
<!-- TODO: sua melhor hipótese sobre a causa raiz -->

### Arquivos/Componentes Suspeitos
<!-- TODO:
- src/path/to/file.ts
- ComponentName
-->
-

---

## Impact Assessment

### Severidade
<!-- TODO: critical | high | medium | low -->

### Usuários/Sistemas Afetados
<!-- TODO -->

### Risco de Regressão
<!-- TODO: áreas que podem ser impactadas pela correção -->

---

## Regression Prevention

### Testes a Adicionar
<!-- TODO:
- Teste que verifica cenário X (que causava o bug)
- Teste para edge case Y
-->
-

---

## Contexto Técnico

### Messaging
<!-- TODO: Kafka | NA -->

### Banco de Dados / Cloud
<!-- TODO: DynamoDB | Aurora MySQL | NA -->

---

## DoF — Definition of Fixed

- [ ] Bug não reproduz mais com os passos documentados
- [ ] Root cause endereçado (não apenas patched)
- [ ] Testes de regressão adicionados e passando
- [ ] Cobertura ≥ 80%
- [ ] Commit local na branch \`fix/${id}-<slug>\`
`;
}
