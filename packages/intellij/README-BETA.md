# SpecKit para IntelliJ IDEA — Guia de Teste Beta

> **Versão:** 0.3.25  
> **Público:** Testadores internos (Beta)  
> **Distribuição:** Banco Pan — Engenharia de Software

---

## O que é o SpecKit?

O **SpecKit** é uma ferramenta de **Spec Driven Development (SDD)** — um fluxo de trabalho que garante que toda história de usuário ou correção de bug seja especificada, validada e rastreada antes e durante a implementação.

Com o plugin IntelliJ você acessa todos os comandos do SpecKit diretamente dentro da IDE, sem precisar sair do ambiente de desenvolvimento.

---

## Pré-requisitos

Antes de instalar o plugin, certifique-se de ter:

| Requisito | Versão mínima | Como verificar |
|---|---|---|
| **IntelliJ IDEA** | 2024.1 | Ajuda → Sobre |
| **Node.js** | 18.x | `node --version` no terminal |

> ⚠️ **Node.js é obrigatório.** O plugin sobe um servidor local (Core Server) que processa os comandos. Sem Node.js instalado o servidor não iniciará.
>
> Instale em: https://nodejs.org/en/download (recomendado: LTS)

---

## Instalação

### Passo 1 — Baixar o arquivo do plugin

Salve o arquivo **`speckit-intellij-0.3.25.zip`** em qualquer pasta do seu computador.

> Não descompacte o arquivo. O IntelliJ instala direto do `.zip`.

---

### Passo 2 — Instalar no IntelliJ

1. Abra o IntelliJ IDEA
2. Vá em **File → Settings** (Windows/Linux) ou **IntelliJ IDEA → Preferences** (macOS)
3. Clique em **Plugins** no menu lateral
4. Clique no ícone de engrenagem ⚙ → **Install Plugin from Disk…**
5. Selecione o arquivo `speckit-intellij-0.3.25.zip`
6. Clique em **OK** e depois em **Restart IDE**

![Caminho: Settings → Plugins → ⚙ → Install Plugin from Disk]

---

### Passo 3 — Abrir o painel SpecKit

Após reiniciar:

1. Procure o ícone **S** na barra lateral direita da IDE
2. Clique nele para abrir o painel **SpecKit**

Ou acesse via menu: **View → Tool Windows → SpecKit**

---

## Primeira utilização

Ao abrir o painel pela primeira vez:

1. O SpecKit tenta **iniciar o Core Server automaticamente** (processo Node.js local, porta 4815)
2. A barra de status no topo do painel mostra:
   - 🟢 **Core Server rodando · porta 4815** — pronto para uso
   - 🔴 **Core Server parado** — clique em **▶ Start Server** para iniciar manualmente

> O servidor roda apenas localmente. Nenhum dado é enviado para servidores externos.

---

## Interface do painel

```
┌─────────────────────────────────────────┐
│  SpecKit    Spec Driven Development     │  ← Cabeçalho
│  v0.3.25                                │
├─────────────────────────────────────────┤
│ 🟢 Core Server rodando · porta 4815  ⏹  │  ← Status + botão Stop
├─────────────────────────────────────────┤
│ ▾ Comandos                              │  ← Painel colapsável
│  ▾ Workspace  🚀/init  🩺/doctor  🤖/agent
│  ▾ Specs      📄/new   🐛/fix    📝/draft …
│  ▾ Workflow   ✅/validate  🚪/gate  📦/batch …
│  ▾ Histórico  📋/audit  🔗/trace  …
│  ▾ Git        🔍/diff  💾/commit
│  ▾ Info       ❓/help
├─────────────────────────────────────────┤
│ 🤖  Bem-vindo ao SpecKit 🚀             │  ← Chat
│                                         │
│                        Você: /status ▶  │
│ 🤖  📋 Specs abertas: ...               │
│                                         │
├─────────────────────────────────────────┤
│ [ Digite um comando...        ] [Enviar] │  ← Input
└─────────────────────────────────────────┘
```

---

## Comandos disponíveis

Clique em qualquer botão do painel ou digite diretamente no campo de texto.

### 🏗️ Workspace

| Comando | O que faz |
|---|---|
| `/init` | Inicializa a estrutura `.speckit/` no projeto aberto |
| `/doctor` | Diagnóstico do workspace (git, Node.js, arquivos de spec) |
| `/agent` | Lista os modos de agente disponíveis (implementador, revisor, debugger, refactor) |

### 📋 Specs

| Comando | O que faz |
|---|---|
| `/new` | Cria uma nova história de usuário a partir do template |
| `/fix` | Cria um novo registro de correção de bug |
| `/draft <descrição>` | Gera um rascunho de spec a partir de texto livre |
| `/status` | Lista todas as specs abertas |
| `/status --all` | Lista todas as specs (incluindo concluídas e canceladas) |
| `/status-fix` | Lista apenas as correções de bug |

### ⚙️ Workflow

| Comando | O que faz |
|---|---|
| `/validate` | Valida a spec ativa e gera configuração para o Copilot |
| `/gate` | Exibe as regras de gate (0–4) e o estado atual da spec |
| `/batch` | Processa todas as specs abertas em lote |
| `/batch --generate` | Batch com geração de configuração Copilot |
| `/batch --generate --unified` | Batch com agent unificado |
| `/review-auto` | Verifica prontidão para transição de gate (Gate 3) |

### 📜 Histórico & Contexto

| Comando | O que faz |
|---|---|
| `/audit` | Exibe as últimas entradas do log de auditoria |
| `/trace` | Exibe a rastreabilidade da spec ativa |
| `/history` | Histórico agregado (auditoria + git + sessão) |
| `/context` | Lista os arquivos de contexto do projeto |

### 🔀 Git

| Comando | O que faz |
|---|---|
| `/diff` | Mostra o diff do git atual no chat |
| `/commit` | Faz commit das alterações staged com prefixo `speckit:` |

---

## Gerenciamento do Core Server

O Core Server é um processo Node.js local que executa na porta **4815**. Ele é gerenciado automaticamente pelo plugin:

| Evento | Comportamento |
|---|---|
| IDE aberta | Servidor inicia automaticamente em background |
| IDE fechada | Servidor encerrado automaticamente |
| Botão **▶ Start Server** | Inicia manualmente (caso tenha sido encerrado) |
| Botão **⏹ Stop** | Encerra manualmente o servidor |

> O servidor fica visível no Gerenciador de Tarefas/Activity Monitor como processo `node`.
> Ele consome pouquíssima memória (~30 MB) e encerra junto com o IntelliJ.

---

## Solução de problemas

### ❌ "Core Server parado" logo ao abrir

1. Verifique se Node.js está instalado: abra um terminal e execute `node --version`
2. Se Node.js estiver instalado, clique em **▶ Start Server** e aguarde até 15 segundos
3. Se continuar falhando, verifique se a porta 4815 não está sendo usada por outro processo

### ❌ Comandos retornam erro

1. Confirme que o status mostra 🟢 (servidor rodando)
2. Tente `/doctor` para diagnóstico completo do workspace
3. Verifique se o projeto aberto no IntelliJ tem um repositório git inicializado

### ❌ Ícone não aparece na barra lateral

- Vá em **View → Tool Windows → SpecKit**
- Ou pesquise "SpecKit" em **Help → Find Action** (Ctrl+Shift+A)

### ⚠️ Compatibilidade

- Testado em IntelliJ IDEA 2024.1 Community e Ultimate
- **Não compatível** com versões anteriores a 2024.1
- Funciona em Windows, macOS e Linux

---

## Feedback

Por favor envie feedback e problemas encontrados diretamente no canal do Teams desta distribuição, informando:

1. Versão do IntelliJ (`Ajuda → Sobre`)
2. Sistema operacional
3. Versão do Node.js (`node --version`)
4. O comando que executou e a mensagem de erro (se houver)
5. Print do painel SpecKit (opcional mas muito útil)

---

*SpecKit v0.3.25 — Banco Pan Engenharia de Software — Distribuição Interna Beta*
