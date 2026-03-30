<!-- metadata
id: 001
title: Login OAuth2 retorna 500 após expiração do token
createdAt: 2026-01-15
version: 1
type: fix
status: open
-->

# Fix: Login OAuth2 retorna 500 após expiração do token

---

### Bug Description

#### Título do Bug
Login OAuth2 retorna erro 500 quando token expirado

#### Sintomas
A rota /api/auth/callback retorna HTTP 500 ao invés de 401 quando o token OAuth2 está expirado.

#### Passos para Reproduzir
- Autenticar via GitHub OAuth2
- Aguardar o token expirar (1 hora)
- Tentar realizar uma requisição autenticada

#### Ambiente Afetado
Production — Node.js 20, Express 4.18, Ubuntu 22.04

#### Frequência de Ocorrência
sempre

---

### Root Cause Hypothesis

#### Hipótese
O middleware de autenticação não trata a exceção TokenExpiredError e deixa o erro propagar sem handler, resultando em 500 genérico.

#### Arquivos/Componentes Suspeitos
- src/middleware/auth.ts
- src/routes/auth.ts

---

### Impact Assessment

#### Severidade
high

#### Usuários/Sistemas Afetados
Todos os usuários autenticados com sessões longas (>1h)

#### Risco de Regressão
Mudanças no middleware de autenticação podem impactar outros fluxos de autenticação

---

### Regression Prevention

#### Testes a Adicionar
- Teste que verifica retorno 401 quando token expirado
- Teste para token inválido retornando 401

---

### Contexto Técnico

#### Messaging
NA

#### Banco de Dados / Cloud
NA

---

### DoF — Definition of Fixed

- [ ] Bug não reproduz mais com os passos documentados
- [ ] Root cause endereçado (não apenas patched)
- [ ] Testes de regressão adicionados e passando
- [ ] Cobertura ≥ 80%
- [ ] Commit local na branch `fix/001-<slug>`
