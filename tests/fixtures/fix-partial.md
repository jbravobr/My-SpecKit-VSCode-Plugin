# Fix 002

<!-- metadata
id: 002
title: Botão exportar PDF não responde no Firefox
createdAt: 2026-01-20
version: 1
type: fix
status: open
-->

## Bug Description

### Título do Bug
Botão exportar PDF não responde no Firefox

### Sintomas
Ao clicar no botão de exportar PDF, nada acontece no Firefox 121.

### Passos para Reproduzir
-

### Ambiente Afetado
Firefox 121, Windows 11

### Frequência de Ocorrência
sempre no Firefox

---

## Root Cause Hypothesis

### Hipótese

### Arquivos/Componentes Suspeitos
- src/components/ExportButton.tsx

---

## Impact Assessment

### Severidade
<!-- TODO: critical | high | medium | low -->

### Usuários/Sistemas Afetados
Usuários do Firefox (~30% da base)

### Risco de Regressão
Mudanças no componente ExportButton

---

## Regression Prevention

### Testes a Adicionar
-

---

## DoF — Definition of Fixed

- [ ] Bug não reproduz mais com os passos documentados
- [ ] Root cause endereçado (não apenas patched)
- [ ] Testes de regressão adicionados e passando
- [ ] Cobertura ≥ 80%
- [ ] Commit local na branch `fix/002-<slug>`
