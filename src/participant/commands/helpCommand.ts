import * as vscode from 'vscode';

interface HelpTopic {
  title: string;
  summary: string;
  usage: string[];
  options?: string[];
  aliases?: string[];
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
    ],
    options: [
      '--all (inclui done e cancelled)',
      '--closed (alias de --all)',
      '--fix (retro-persiste gate: 4 em specs com status: done e gate desatualizado; implica --all)',
    ],
    aliases: ['/status-all', '/status-fix'],
  },
  batch: {
    title: '/batch',
    summary: 'Processa specs em lote e pode gerar configs/agentes.',
    usage: [
      '@speckit /batch',
      '@speckit /batch --generate',
      '@speckit /batch --generate --unified',
    ],
    options: ['--generate (ou --gen)', '--unified (junto com --generate)'],
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
      '@speckit /review-auto --changes-requested',
      '@speckit /review-auto --approved',
    ],
    options: [
      '--changes-requested (alias: --changes, --rework) para retornar Gate 3 → Gate 2',
      '--approved (alias: --approve) para encerrar Gate 3 → Gate 4/status done',
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

function renderGeneralHelp(): string {
  return (
    '**SpecKit — Ajuda rápida**\n\n' +
    '**Comandos com parâmetros mais usados:**\n' +
    '- `/status [--all|--closed] [--fix]`\n' +
    '- `/batch [--generate|--gen] [--unified]`\n' +
    '- `/validate [--devtools]`\n' +
    '- `/review-auto`\n' +
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
    return;
  }

  const topicKey = normalizeTopic(rawTopic);
  const topic = HELP_TOPICS[topicKey];
  if (!topic) {
    stream.markdown(
      `❌ Comando não reconhecido em /help: \`${rawTopic}\`\n\n` +
        '**Tópicos disponíveis:** status, batch, validate, review-auto, draft, help\n' +
        'Use `@speckit /help` para ver a ajuda geral.',
    );
    return;
  }

  stream.markdown(renderTopicHelp(topic));
}
