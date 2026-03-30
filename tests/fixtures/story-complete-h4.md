<!-- metadata
id: 001
title: Autenticação via OAuth2 com GitHub
createdAt: 2026-01-15
version: 1
type: story
status: open
-->

# História: Autenticação via OAuth2 com GitHub

---

### Requisito de Negócio

#### Problema
Os usuários precisam criar contas manualmente, causando fricção no onboarding.

#### Valor
Login social via GitHub elimina o cadastro manual, reduz o tempo de onboarding e aumenta a conversão. Indicador de sucesso: taxa de conversão no cadastro.

#### Stakeholders
- Time de Produto (conversão de usuários)
- Usuários finais (experiência de login simplificada)
- Time de Segurança (autenticação padronizada)

---

### Especificação Funcional

#### User Stories
- Como usuário, quero fazer login com minha conta GitHub para não precisar criar uma senha nova
- Como sistema, quero validar o token OAuth2 para garantir a identidade do usuário

#### Critérios de Aceite
- Botão "Login com GitHub" presente na página de login
- Redirecionamento correto para GitHub OAuth2
- Token válido resulta em sessão autenticada
- Token inválido retorna erro 401

#### Fora de Escopo
- Login com outros providers (Google, Microsoft)
- Autenticação via senha local

---

### Especificação Não-Funcional

#### Performance
P99 < 200ms para validação do token OAuth2.

#### Segurança
Tokens armazenados em memória apenas, nunca em localStorage. HTTPS obrigatório.

#### Escalabilidade
Stateless — cada requisição valida o token independentemente.

#### Usabilidade
Feedback visual imediato durante o fluxo de autenticação.

#### Disponibilidade
99,9% uptime. Falhas no provider redirecionam para página de erro amigável.

---

### Especificação Técnica

#### Linguagem
typescript

#### Framework
react

#### Arquitetura
hexagonal

#### Target
frontend

#### Banco de Dados
PostgreSQL 15 (tabela users)

#### Infraestrutura
Vercel, GitHub OAuth2 App

---

### DoR — Definition of Ready

- [x] User stories com critérios de aceite mensuráveis
- [x] Escopo delimitado (o que está e o que não está incluído)
- [x] Requisitos não-funcionais definidos (performance, segurança, disponibilidade)
- [x] Stack técnica decidida (linguagem, framework, arquitetura)
- [x] Padrão arquitetural definido
- [ ] Requisito de negócio documentado e aprovado pelo stakeholder responsável
- [ ] DoD acordado com o time de desenvolvimento

---

### DoD — Definition of Done

- Todos os critérios de aceite validados por testes automatizados
- Cobertura de testes ≥ 80%
- Code review aprovado por pelo menos 1 revisor
- Deploy em ambiente de homologação validado
- Contrato de API (OpenAPI/schema) atualizado
