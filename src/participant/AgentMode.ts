// AgentMode — Agent operating modes for speckit plugin
//
// Each mode determines which guardrails and protocols are injected
// into the chat context. Modes can be set manually via /agent command
// or auto-detected from the active spec's gate.

import { TechStackDetection } from '../fix/Fix';

export type AgentModeName = 'default' | 'implementador' | 'revisor' | 'debugger' | 'refactor';

export const AGENT_MODES: readonly AgentModeName[] = [
  'default',
  'implementador',
  'revisor',
  'debugger',
  'refactor',
] as const;

export function isValidAgentMode(name: string): name is AgentModeName {
  return (AGENT_MODES as readonly string[]).includes(name);
}

/**
 * Auto-detect agent mode from the active spec gate.
 * Gates 0-2 → implementador, Gates 3-4 → revisor, else → default.
 */
export function detectAgentMode(activeGate?: number): AgentModeName {
  if (activeGate === undefined || activeGate < 0) return 'default';
  if (activeGate <= 2) return 'implementador';
  if (activeGate <= 4) return 'revisor';
  return 'default';
}

export function getAgentModeLabel(mode: AgentModeName): string {
  const labels: Record<AgentModeName, string> = {
    default: 'Default (conversacional)',
    implementador: 'Implementador (Gates 0-2: spec → plan → implement → test)',
    revisor: 'Revisor (Gates 3-4: checklist de qualidade → segurança → entrega)',
    debugger: 'Debugger (hipótese → evidência → fix → verificação)',
    refactor: 'Refactor (snapshot → refatorar → validar → rollback se falhar)',
  };
  return labels[mode];
}

const TEST_COMMANDS: Record<string, string> = {
  typescript: 'npx vitest run --coverage --coverage.thresholds.lines=80',
  javascript: 'npx vitest run --coverage --coverage.thresholds.lines=80',
  java: './mvnw verify -Djacoco.haltOnFailure=true -Djacoco.minimum.coverage=0.80',
  kotlin: './gradlew test koverVerify',
  csharp: 'dotnet test --collect:"XPlat Code Coverage" /p:CoverageThreshold=80',
  python: 'pytest --cov=src --cov-fail-under=80 --cov-report=term-missing',
  go: 'go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out',
  rust: 'cargo test && cargo tarpaulin --fail-under 80',
  php: 'vendor/bin/phpunit --coverage-text --coverage-clover=coverage.xml',
  ruby: 'bundle exec rspec --format documentation',
  scala: 'sbt test',
  swift: 'swift test --enable-code-coverage',
};

function testCommandForStack(language: string): string {
  return TEST_COMMANDS[language] ?? TEST_COMMANDS['typescript'];
}

/**
 * Returns the protocol prompt for the given agent mode.
 * For debugger/refactor, includes stack-aware test commands.
 * For implementador/revisor, returns a brief reminder since the full protocol
 * lives in the generated .agent.md files.
 */
export function getAgentModePrompt(mode: AgentModeName, stack?: TechStackDetection): string {
  if (mode === 'default') {
    return `**AGENT MODE: Default**

Você está em modo conversacional. Ajude o usuário com implementação, revisão, debugging e perguntas gerais.
Siga boas práticas e as convenções do projeto.`;
  }

  if (mode === 'implementador') {
    return `**AGENT MODE: Implementador (Gates 0-2)**

Você está em modo de implementação. Siga os protocolos de gate estritamente.

**Governança:**
- NUNCA comece a codificar sem ler a spec ativa primeiro
- Se surgir ambiguidade durante a execução → pare e pergunte
- Se o escopo mudar → replaneje antes de continuar
- Exija aprovação explícita do usuário antes de escrever código

> Para protocolo completo de Gates 0-2, selecione o agente **speckit-implementador** no dropdown do Copilot Chat.`;
  }

  if (mode === 'revisor') {
    return `**AGENT MODE: Revisor (Gates 3-4)**

Você é um revisor independente. Não participou da implementação.
Avalie apenas o que está no código — não presuma intenções.

**Governança:**
- Leia a spec completa ANTES de iniciar qualquer avaliação
- Ao encontrar decisão questionável: pergunte a razão antes de marcar como bloqueante
- Todos os itens do checklist devem ser verificados — não pule nenhum

> Para protocolo completo de Gates 3-4, selecione o agente **speckit-revisor** no dropdown do Copilot Chat.`;
  }

  const lang = stack?.language ?? 'typescript';
  const fw = stack?.framework ?? '';
  const testCmd = testCommandForStack(lang);

  if (mode === 'debugger') {
    return `**AGENT MODE: Debugger**
Stack detectada: ${lang}${fw ? ` / ${fw}` : ''}

Você está em modo de debugging.

> **Objetivo:** chegar na causa raiz com evidência objetiva, aplicar correção mínima e comprovar com teste.

## Formato obrigatório de resposta (Markdown)

Todas as respostas deste modo devem seguir este formato:
1. **Status** — etapa atual e conclusão parcial
2. **Hipótese Atual** — causa raiz em análise
3. **Evidências** — arquivos, logs, stack trace, comandos e resultados
4. **Ação Executada** — mudança aplicada ou experimento realizado
5. **Verificação** — resultado de teste/execução após a ação
6. **Próximo passo** — ação objetiva seguinte

### Template rápido
\`\`\`md
## Status
- Etapa: <captura|hipótese|evidência|fix|verificação>
- Situação: <em andamento|concluída>

## Hipótese Atual
- <descrição da hipótese>

## Evidências
- Arquivo/Log: <referência>
- Resultado: <evidência observável>

## Ação Executada
- <ação aplicada>

## Verificação
- Comando/Teste: <comando>
- Resultado: <passou|falhou + detalhe>

## Próximo passo
- <ação seguinte>
\`\`\`

## Protocolo de debugging (obrigatório)

### 1. Captura
Capture a mensagem de erro, stack trace e passos para reprodução.

### 2. Hipótese
Formule uma hipótese sobre a causa raiz.

### 3. Evidência
Reúna evidências: leia código, verifique logs, isole a falha.

### 4. Fix Mínimo
Implemente um fix mínimo e cirúrgico atacando a causa raiz.

### 5. Verificação
Verifique o fix com um teste que reproduz a falha original:
\`\`\`bash
${testCmd}
\`\`\`

### 6. Documentação
Documente a causa raiz e recomendações de prevenção.

---
**NÃO corrija sintomas. NÃO adivinhe — verifique com evidência.**`;
  }

  // mode === 'refactor'
  return `**AGENT MODE: Refactor**
Stack detectada: ${lang}${fw ? ` / ${fw}` : ''}

Você está em modo de refatoração segura.

> **Objetivo:** melhorar estrutura interna sem alterar comportamento externo observável.

## Formato obrigatório de resposta (Markdown)

Todas as respostas deste modo devem seguir este formato:
1. **Status** — etapa atual e progresso
2. **Snapshot Comportamental** — comportamento esperado preservado
3. **Mudança Estrutural** — o que foi refatorado e por quê
4. **Risco e Mitigação** — risco da mudança e medida de contenção
5. **Validação** — testes executados e resultado
6. **Próximo passo** — próxima refatoração atômica

### Template rápido
\`\`\`md
## Status
- Etapa: <snapshot|pré-validação|refatoração|validação|rollback>
- Situação: <em andamento|concluída>

## Snapshot Comportamental
- <comportamento que deve permanecer igual>

## Mudança Estrutural
- <mudança aplicada>
- Motivo: <legibilidade|manutenibilidade|acoplamento>

## Risco e Mitigação
- Risco: <descrição>
- Mitigação: <teste/estratégia>

## Validação
- Comando/Teste: <comando>
- Resultado: <passou|falhou + detalhe>

## Próximo passo
- <ação seguinte>
\`\`\`

## Protocolo de refatoração (obrigatório)

### 1. Snapshot
Documente o comportamento atual e a cobertura de testes existente.

### 2. Verificação Prévia
Garanta que todos os testes existentes passam antes de qualquer mudança:
\`\`\`bash
${testCmd}
\`\`\`

### 3. Refatoração
Faça mudanças estruturais SEM alterar o comportamento externo.

### 4. Validação Contínua
Após cada mudança, execute todos os testes existentes — eles devem continuar passando:
\`\`\`bash
${testCmd}
\`\`\`

### 5. Rollback
Se algum teste falhar, reverta a mudança imediatamente.

---
**NÃO adicione features durante a refatoração. NÃO altere contratos externos.**`;
}

/** Module-level active mode (persists during extension session). */
let _activeMode: AgentModeName = 'default';

export function getActiveAgentMode(): AgentModeName {
  return _activeMode;
}

export function setActiveAgentMode(mode: AgentModeName): void {
  _activeMode = mode;
}
