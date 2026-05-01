/**
 * Integration tests for the SpecKit Chat Participant routing.
 *
 * These tests call handleSpeckitRequest() — the actual requestHandler registered
 * with vscode.chat.createChatParticipant — exercising the full routing switch
 * and both commands that lack integration coverage (/draft, /fix).
 *
 * Infrastructure: @vscode/test-electron (real VS Code host, real file I/O).
 */
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

import { handleSpeckitRequest } from '../../../src/participant/speckitParticipant';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStream() {
  const parts: string[] = [];
  return {
    markdown: (t: string) => {
      parts.push(t);
    },
    getAll: () => parts.join(''),
  };
}

function createRequest(command: string, prompt = ''): vscode.ChatRequest {
  return { command, prompt, references: [], toolInvocations: [] } as any;
}

async function removeDir(dirPath: string): Promise<void> {
  try {
    await vscode.workspace.fs.delete(vscode.Uri.file(dirPath), { recursive: true });
  } catch {
    // não existe — ignorar
  }
}

async function findGeneratedFile(
  dirPath: string,
  prefix: string,
  suffix: string,
): Promise<string | undefined> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath));
    return entries
      .filter(([, type]) => type === vscode.FileType.File)
      .map(([name]) => name)
      .find((name) => name.startsWith(prefix) && name.endsWith(suffix));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Suite: roteamento — comando desconhecido
// ---------------------------------------------------------------------------

suite('Participant routing — default', () => {
  test('comando desconhecido exibe help text com todos os comandos', async () => {
    const stream = createStream();
    await handleSpeckitRequest(createRequest('unknown'), {} as any, stream as any, {} as any);

    const out = stream.getAll();
    assert.ok(out.includes('SpecKit'), 'Deveria exibir o nome do produto');
    assert.ok(out.includes('/new'), 'Help deveria listar /new');
    assert.ok(out.includes('/draft'), 'Help deveria listar /draft');
    assert.ok(out.includes('/validate'), 'Help deveria listar /validate');
  });
});

// ---------------------------------------------------------------------------
// Suite: /draft — story intent
// ---------------------------------------------------------------------------

suite('Participant routing — /draft story intent', () => {
  let root: string;
  let specDir: string;

  setup(() => {
    root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    specDir = path.join(root, '.speckit');
  });

  teardown(async () => {
    await removeDir(specDir);
  });

  test('/draft: cria elicit-story-001.prompt.md para ideia de feature', async () => {
    const stream = createStream();
    const request = createRequest('draft', 'Quero calcular comissão de vendedores via Kafka');

    await handleSpeckitRequest(request, {} as any, stream as any, {} as any);

    const generatedFile = await findGeneratedFile(specDir, 'elicit-story-', '.prompt.md');
    assert.ok(generatedFile, 'Um prompt de elicitação de story deveria ter sido criado');
    assert.match(
      generatedFile!,
      /^elicit-story-US-[A-Z0-9]{1,10}-\d{8}-\d{4}\.prompt\.md$/,
      'O arquivo deveria usar o formato atual de ID',
    );
  });

  test('/draft: stream instrui usar Novo Chat para elicitação', async () => {
    const stream = createStream();
    const request = createRequest('draft', 'Quero calcular comissão de vendedores via Kafka');

    await handleSpeckitRequest(request, {} as any, stream as any, {} as any);

    const generatedFile = await findGeneratedFile(specDir, 'elicit-story-', '.prompt.md');
    const out = stream.getAll();
    assert.ok(out.includes('Novo Chat'), 'Stream deveria instruir usar Novo Chat');
    assert.ok(generatedFile, 'O arquivo gerado deveria existir');
    assert.ok(out.includes(generatedFile!), 'Stream deveria mencionar o arquivo gerado');
  });
});

// ---------------------------------------------------------------------------
// Suite: /draft — fix intent
// ---------------------------------------------------------------------------

suite('Participant routing — /draft fix intent', () => {
  let root: string;
  let specDir: string;

  setup(() => {
    root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    specDir = path.join(root, '.speckit');
  });

  teardown(async () => {
    await removeDir(specDir);
  });

  test('/draft --fix: cria prompt de elicitação com ID atual', async () => {
    const stream = createStream();
    const request = createRequest(
      'draft',
      'O login OAuth2 retorna 500 após expiração do token --fix',
    );

    await handleSpeckitRequest(request, {} as any, stream as any, {} as any);

    const generatedFile = await findGeneratedFile(specDir, 'elicit-fix-', '.prompt.md');
    assert.ok(generatedFile, 'Um prompt de elicitação de fix deveria ter sido criado');
    assert.match(
      generatedFile!,
      /^elicit-fix-FIX-[A-Z0-9]{1,10}-\d{8}-\d{4}\.prompt\.md$/,
      'O arquivo deveria usar o formato atual de ID',
    );
  });

  test('/draft --fix: stream menciona o ID atual do fix', async () => {
    const stream = createStream();
    const request = createRequest(
      'draft',
      'O login OAuth2 retorna 500 após expiração do token --fix',
    );

    await handleSpeckitRequest(request, {} as any, stream as any, {} as any);

    assert.match(
      stream.getAll(),
      /FIX-[A-Z0-9]{1,10}-\d{8}-\d{4}/,
      'Stream deveria mencionar o ID atual do fix',
    );
  });
});

// ---------------------------------------------------------------------------
// Suite: /fix
// ---------------------------------------------------------------------------

suite('Participant routing — /fix', () => {
  let root: string;
  let specDir: string;

  setup(() => {
    root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    specDir = path.join(root, '.speckit');
  });

  teardown(async () => {
    await removeDir(specDir);
  });

  test('/fix: cria arquivo de fix com ID atual no .speckit/', async () => {
    const stream = createStream();
    await handleSpeckitRequest(createRequest('fix'), {} as any, stream as any, {} as any);

    const generatedFile = await findGeneratedFile(specDir, 'FIX-', '.md');
    assert.ok(generatedFile, 'Um fix deveria ter sido criado');
    assert.match(
      generatedFile!,
      /^FIX-[A-Z0-9]{1,10}-\d{8}-\d{4}\.md$/,
      'O arquivo deveria usar o formato atual de ID',
    );
  });

  test('/fix: stream confirma criação e menciona o ID atual', async () => {
    const stream = createStream();
    await handleSpeckitRequest(createRequest('fix'), {} as any, stream as any, {} as any);

    const out = stream.getAll();
    assert.match(out, /FIX-[A-Z0-9]{1,10}-\d{8}-\d{4}/, 'Stream deveria mencionar o ID atual');
  });
});

// ---------------------------------------------------------------------------
// Suite: /history
// ---------------------------------------------------------------------------

suite('Participant routing — /history', () => {
  let root: string;
  let specDir: string;

  setup(() => {
    root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    specDir = path.join(root, '.speckit');
  });

  teardown(async () => {
    await removeDir(specDir);
  });

  test('/history: exibe visão agregada após comandos que geram trilhas', async () => {
    await handleSpeckitRequest(createRequest('new'), {} as any, createStream() as any, {} as any);

    const stream = createStream();
    await handleSpeckitRequest(createRequest('history'), {} as any, stream as any, {} as any);

    const out = stream.getAll();
    assert.ok(out.includes('History'), 'Deveria exibir bloco principal de history');
    assert.ok(out.includes('Sessões canônicas'), 'Deveria exibir agrupamento por sessão');
  });

  test('/history audit 5: aplica filtro de tipo', async () => {
    await handleSpeckitRequest(createRequest('fix'), {} as any, createStream() as any, {} as any);

    const stream = createStream();
    await handleSpeckitRequest(
      createRequest('history', 'audit 5'),
      {} as any,
      stream as any,
      {} as any,
    );

    const out = stream.getAll();
    assert.ok(out.includes('filtro: `audit`'), 'Deveria indicar filtro audit');
  });

  test('/history session implementador: exibe drill-down da sessão canônica', async () => {
    await handleSpeckitRequest(createRequest('new'), {} as any, createStream() as any, {} as any);

    const stream = createStream();
    await handleSpeckitRequest(
      createRequest('history', 'session implementador'),
      {} as any,
      stream as any,
      {} as any,
    );

    const out = stream.getAll();
    assert.ok(out.includes('Sessão canônica'), 'Deveria exibir sessão selecionada');
    assert.ok(out.includes('audit:'), 'Deveria exibir resumo por tipo');
  });
});

// ---------------------------------------------------------------------------
// Suite: smoke — todos os comandos roteiam sem throw
// ---------------------------------------------------------------------------

suite('Participant routing — smoke (todos os comandos)', () => {
  let root: string;
  let specDir: string;

  setup(async () => {
    root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    specDir = path.join(root, '.speckit');
    // Garante que o workspace tem ao menos uma story para /validate, /status
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(specDir));
  });

  teardown(async () => {
    await removeDir(specDir);
    await removeDir(path.join(root, '.github'));
  });

  const commands = ['new', 'fix', 'validate', 'status', 'draft', 'history'];

  for (const cmd of commands) {
    test(`/${cmd}: não lança exceção com workspace vazio`, async () => {
      const stream = createStream();
      // Não deve lançar — pode retornar erro no stream, mas não throw
      await assert.doesNotReject(
        () =>
          handleSpeckitRequest(
            createRequest(cmd, 'smoke test'),
            {} as any,
            stream as any,
            {} as any,
          ),
        `/${cmd} não deveria lançar exceção`,
      );
    });
  }
});
