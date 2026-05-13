import * as vscode from 'vscode';

interface HelpTopic {
  title: string;
  summary: string;
  usage: string[];
  options?: string[];
  aliases?: string[];
}

interface ContextualHelpAction {
  command: string;
  description: string;
  buttonTitle?: string;
}

const HELP_TOPICS: Record<string, HelpTopic> = {
  status: {
    title: '/status',
    summary: 'Exibe resumo de stories e fixes no workspace.',
    usage: [
      '@speckit /status',
      '@speckit /status --all',
      '@speckit /status --closed',
      '@speckit /status --fix',
      '@speckit /status --fix --confirm <intent-id>',
    ],
    options: [
      '--all (inclui done e cancelled)',
      '--closed (alias de --all)',
      '--fix (propõe retrofit de gate: 4 em specs com status: done e gate desatualizado; implica --all)',
      '--confirm <intent-id> (confirma explicitamente o retrofit proposto por --fix)',
    ],
    aliases: ['/status-all', '/status-fix'],
  },
  batch: {
    title: '/batch',
    summary:
      'Processa specs em lote. Use quando você já tem múltiplas stories ou fixes escritos e quer gerar configs/agentes para todos de uma vez.',
    usage: [
      '@speckit /batch',
      '@speckit /batch --generate',
      '@speckit /batch --generate --unified',
      '@speckit /batch --generate --unified --story <id>',
      '@speckit /batch --generate --unified --branch-strategy <session|cited>',
      '@speckit /batch --generate --unified --branch-strategy session --confirm <intent-id>',
    ],
    options: [
      '--generate (ou --gen)',
      '--unified (junto com --generate) — gera agente implementador/revisor por story',
      '--story <id> (filtra uma story específica, requer --generate --unified)',
      '--branch-strategy <session|cited> (resolve a governança de branch quando a story cita branch)',
      '--confirm <intent-id> (confirma a criação pendente da branch da sessão sugerida no modo unificado)',
    ],
    aliases: ['/batch-generate', '/batch-unified'],
  },
  validate: {
    title: '/validate',
    summary: 'Valida a spec ativa e gera artefatos de configuração.',
    usage: ['@speckit /validate', '@speckit /validate --devtools'],
    options: ['--devtools (inclui skill de tooling quando aplicável)'],
  },
  draft: {
    title: '/draft',
    summary: 'Rascunha elicitação para story/fix/refactoring/spike.',
    usage: [
      '@speckit /draft <descrição>',
      '@speckit /draft <descrição> --fix',
      '@speckit /draft <descrição> --refactoring',
      '@speckit /draft <descrição> --spike',
    ],
    options: ['--fix ou --bug', '--refactoring ou --refactor', '--spike ou --poc'],
  },
  help: {
    title: '/help',
    summary: 'Mostra ajuda geral ou detalhada por comando.',
    usage: ['@speckit /help', '@speckit /help status', '@speckit /help batch'],
    aliases: ['/help-status'],
  },
  'review-auto': {
    title: '/review-auto',
    summary:
      'Orquestra revisão e transições de gate da story com evidência explícita no chat (2→3, 3→2, 3→4).',
    usage: [
      '@speckit /review-auto',
      '@speckit /review-auto --confirm <intent-id>',
      '@speckit /review-auto --changes-requested',
      '@speckit /review-auto --approved',
      '@speckit /review-auto --mutation',
      '@speckit /review-auto --batch-consent',
      '@speckit /review-auto --batch-consent --confirm <intent-id>',
      '@speckit /review-auto --auto',
    ],
    options: [
      '--confirm <intent-id> para confirmar transição proposta (obrigatório fora de --auto)',
      '--changes-requested (alias: --changes, --rework) para retornar Gate 3 → Gate 2',
      '--approved (alias: --approve) para avançar Gate 3 → Gate 4/status ready-to-commit',
      '--mutation (alias: --mut) para detalhar trilha opcional de mutation quando CRAP > 30',
      '--batch-consent para propor consentimento único da sessão batch unificada',
      '--auto para handoff automático somente quando consentimento batch estiver ativo',
    ],
  },
  gate: {
    title: '/gate',
    summary: 'Exibe regras de transição e valida cenários de gate/status.',
    usage: [
      '@speckit /gate',
      '@speckit /gate rules',
      '@speckit /gate check gate 0 1',
      '@speckit /gate check status open in-progress',
    ],
    options: [
      'check gate <de> <para> (valida transição entre gates 0..4)',
      'check status <de> <para> (valida transição de status)',
    ],
  },
};

const TOPIC_ALIASES: Record<string, string> = {
  'status-all': 'status',
  'status-fix': 'status',
  'help-status': 'status',
  'batch-generate': 'batch',
  'batch-unified': 'batch',
};

function normalizeTopic(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/^\//, '');
  return TOPIC_ALIASES[cleaned] ?? cleaned;
}

function emitChatQuickActionButton(
  stream: vscode.ChatResponseStream,
  title: string,
  query: string,
): void {
  const command: vscode.Command = {
    title,
    command: 'speckit.runChatQuickAction',
    arguments: [query],
  };

  if (typeof stream.button === 'function') {
    stream.button(command);
    return;
  }

  if (typeof stream.push === 'function') {
    stream.push(new vscode.ChatResponseCommandButtonPart(command));
  }
}

function renderContextualHelp(actions: ContextualHelpAction[], note?: string): string {
  const lines = actions.map((item) => `- \`${item.command}\` (${item.description})`).join('\n');
  return (
    '### Comandos disponíveis agora (contextuais)\n' + `${lines}\n` + (note ? `\n> ${note}\n` : '')
  );
}

const GENERAL_CONTEXTUAL_ACTIONS: ContextualHelpAction[] = [
  {
    command: '@speckit /status',
    description: 'listar specs ativas no workspace',
    buttonTitle: '📊 Ver Status das Specs',
  },
  {
    command: '@speckit /review-auto',
    description: 'orquestrar revisão/transições da story ativa',
    buttonTitle: '▶ Abrir Fluxo de Revisão',
  },
  {
    command: '@speckit /gate',
    description: 'consultar regras de transição de gate/status',
    buttonTitle: '🚪 Ver Regras de Gate',
  },
];

const TOPIC_CONTEXTUAL_ACTIONS: Record<string, ContextualHelpAction[]> = {
  status: [
    {
      command: '@speckit /status',
      description: 'listar specs abertas',
      buttonTitle: '📊 Atualizar Status',
    },
    {
      command: '@speckit /status --all',
      description: 'incluir done/cancelled',
      buttonTitle: '📦 Ver Status Completo (--all)',
    },
    {
      command: '@speckit /status --fix',
      description: 'propor retrofit de gate para specs done',
    },
  ],
  'review-auto': [
    {
      command: '@speckit /review-auto',
      description: 'orquestrar revisão Gate 3',
      buttonTitle: '▶ Iniciar Revisão Automática',
    },
    {
      command: '@speckit /review-auto --batch-consent',
      description: 'iniciar consentimento batch para fluxos --auto',
    },
    {
      command: '@speckit /review-auto --confirm <intent-id>',
      description: 'confirmar transição proposta por intent',
    },
    {
      command: '@speckit /review-auto --mutation',
      description: 'detalhar trilha opcional de mutation quando CRAP > 30',
    },
  ],
  gate: [
    {
      command: '@speckit /gate',
      description: 'mostrar matriz de transições gate/status',
      buttonTitle: '🚪 Mostrar Regras de Gate',
    },
    {
      command: '@speckit /gate check gate 0 1',
      description: 'exemplo de validação de transição de gate',
      buttonTitle: '▶ Validar Gate 0 → 1',
    },
    {
      command: '@speckit /gate check status open in-progress',
      description: 'exemplo de validação de transição de status',
    },
  ],
};

function renderGeneralHelp(): string {
  return (
    '**SpecKit — Ajuda rápida**\n\n' +
    '**Qual fluxo usar?**\n' +
    '- 📝 **Story ou fix individual:** `/new` ou `/fix` → preencha a spec → `/validate` → ciclo agente implementador/revisor\n' +
    '- 📦 **Backlog completo (múltiplas specs já escritas):** `/batch --generate --unified` → agentes para todas em lote\n' +
    '- 🔧 **Refactoring, debug ou análise:** abra um agente diretamente no Copilot Chat — sem necessidade de spec\n\n' +
    '**Comandos com parâmetros mais usados:**\n' +
    '- `/status [--all|--closed] [--fix] [--confirm <intent-id>]`\n' +
    '- `/batch [--generate|--gen] [--unified] [--story <id>] [--branch-strategy <session|cited>] [--confirm <intent-id>]`\n' +
    '- `/gate [check gate <de> <para>|check status <de> <para>]`\n' +
    '- `/validate [--devtools]`\n' +
    '- `/review-auto [--approved|--changes-requested|--mutation] [--confirm <intent-id>]`\n' +
    '- `/verify [--gate <0..4>]` → validação determinística (alimenta o Revisor)\n' +
    '- `/draft [--fix|--refactoring|--spike]`\n\n' +
    '**Atalhos (aliases):**\n' +
    '- `/status-all` → `/status --all`\n' +
    '- `/status-fix` → `/status --fix`\n' +
    '- `/batch-generate` → `/batch --generate`\n' +
    '- `/batch-unified` → `/batch --generate --unified`\n' +
    '- `/help-status` → `/help status`\n\n' +
    '**Ajuda detalhada:**\n' +
    '- `@speckit /help status`\n' +
    '- `@speckit /help batch`\n' +
    '- `@speckit /help gate`\n' +
    '- `@speckit /help validate`\n' +
    '- `@speckit /help draft`\n'
  );
}

function renderTopicHelp(topic: HelpTopic): string {
  const options =
    topic.options && topic.options.length > 0
      ? `\n\n**Parâmetros:**\n${topic.options.map((opt) => `- ${opt}`).join('\n')}`
      : '';
  const aliases =
    topic.aliases && topic.aliases.length > 0
      ? `\n\n**Atalhos:**\n${topic.aliases.map((alias) => `- ${alias}`).join('\n')}`
      : '';

  return (
    `**${topic.title}**\n\n` +
    `${topic.summary}\n\n` +
    `**Uso:**\n${topic.usage.map((line) => `- ${line}`).join('\n')}` +
    `${options}${aliases}`
  );
}

export async function handleHelpCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
): Promise<void> {
  const rawTopic = (request.prompt ?? '').trim();
  if (!rawTopic) {
    stream.markdown(renderGeneralHelp());
    stream.markdown(
      renderContextualHelp(
        GENERAL_CONTEXTUAL_ACTIONS,
        'Use os botões para continuidade simples e digite parâmetros quando precisar de validações específicas.',
      ),
    );
    for (const action of GENERAL_CONTEXTUAL_ACTIONS) {
      if (action.buttonTitle) {
        emitChatQuickActionButton(stream, action.buttonTitle, action.command);
      }
    }
    return;
  }

  const topicKey = normalizeTopic(rawTopic);
  const topic = HELP_TOPICS[topicKey];
  if (!topic) {
    stream.markdown(
      `❌ Comando não reconhecido em /help: \`${rawTopic}\`\n\n` +
        '**Tópicos disponíveis:** status, batch, gate, validate, review-auto, draft, help\n' +
        'Use `@speckit /help` para ver a ajuda geral.',
    );
    stream.markdown(
      renderContextualHelp([
        { command: '@speckit /help', description: 'abrir ajuda geral' },
        { command: '@speckit /help status', description: 'abrir ajuda detalhada de status' },
        {
          command: '@speckit /help review-auto',
          description: 'abrir ajuda detalhada de review-auto',
        },
      ]),
    );
    emitChatQuickActionButton(stream, '📘 Abrir Ajuda Geral', '@speckit /help');
    return;
  }

  stream.markdown(renderTopicHelp(topic));
  const contextualActions = TOPIC_CONTEXTUAL_ACTIONS[topicKey];
  if (contextualActions && contextualActions.length > 0) {
    stream.markdown(renderContextualHelp(contextualActions));
    for (const action of contextualActions) {
      if (action.buttonTitle) {
        emitChatQuickActionButton(stream, action.buttonTitle, action.command);
      }
    }
  }
}
