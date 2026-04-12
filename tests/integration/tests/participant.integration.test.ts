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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
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

    const filePath = path.join(specDir, 'elicit-story-001.prompt.md');
    assert.ok(await fileExists(filePath), 'elicit-story-001.prompt.md deveria ter sido criado');
  });

  test('/draft: stream instrui usar Novo Chat para elicitação', async () => {
    const stream = createStream();
    const request = createRequest('draft', 'Quero calcular comissão de vendedores via Kafka');

    await handleSpeckitRequest(request, {} as any, stream as any, {} as any);

    const out = stream.getAll();
    assert.ok(out.includes('Novo Chat'), 'Stream deveria instruir usar Novo Chat');
    assert.ok(
      out.includes('elicit-story-001.prompt.md'),
      'Stream deveria mencionar o arquivo gerado',
    );
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

  test('/draft --fix: cria elicit-fix-001.prompt.md', async () => {
    const stream = createStream();
    const request = createRequest(
      'draft',
      'O login OAuth2 retorna 500 após expiração do token --fix',
    );

    await handleSpeckitRequest(request, {} as any, stream as any, {} as any);

    const filePath = path.join(specDir, 'elicit-fix-001.prompt.md');
    assert.ok(await fileExists(filePath), 'elicit-fix-001.prompt.md deveria ter sido criado');
  });

  test('/draft --fix: stream menciona FIX-001', async () => {
    const stream = createStream();
    const request = createRequest(
      'draft',
      'O login OAuth2 retorna 500 após expiração do token --fix',
    );

    await handleSpeckitRequest(request, {} as any, stream as any, {} as any);

    assert.ok(stream.getAll().includes('FIX-001'), 'Stream deveria mencionar FIX-001');
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

  test('/fix: cria FIX-001.md no .speckit/', async () => {
    const stream = createStream();
    await handleSpeckitRequest(createRequest('fix'), {} as any, stream as any, {} as any);

    const filePath = path.join(specDir, 'FIX-001.md');
    assert.ok(await fileExists(filePath), 'FIX-001.md deveria ter sido criado');
  });

  test('/fix: stream confirma criação e instrui próximos passos', async () => {
    const stream = createStream();
    await handleSpeckitRequest(createRequest('fix'), {} as any, stream as any, {} as any);

    const out = stream.getAll();
    assert.ok(out.includes('FIX-001'), 'Stream deveria mencionar FIX-001');
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

  const commands = ['new', 'fix', 'validate', 'status', 'draft'];

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
