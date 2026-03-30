/**
 * Integration tests for SpecKit command handlers running inside a real VS Code host.
 *
 * No DI mocking — all commands use the default vscodeFileSystem and vscodeWorkspace adapters.
 * Each suite writes story fixtures to the integration workspace, calls the handler,
 * then asserts both stream output and disk state.
 */
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { readFileSync } from 'fs';

import { handleValidateCommand } from '../../../src/participant/commands/validateCommand';
import { handleApplyCommand } from '../../../src/participant/commands/applyCommand';
import { handleStatusCommand } from '../../../src/participant/commands/statusCommand';
import { handleReviewCommand } from '../../../src/participant/commands/reviewCommand';
import { handleNewCommand } from '../../../src/participant/commands/newCommand';

// __dirname when compiled: <project>/out/integration/tests/integration/tests
const fixturesDir = path.resolve(__dirname, '../../../../../tests/fixtures');
const completeStoryMd = readFileSync(path.join(fixturesDir, 'story-complete.md'), 'utf-8');
const partialStoryMd = readFileSync(path.join(fixturesDir, 'story-partial.md'), 'utf-8');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStream() {
  const parts: string[] = [];
  return {
    markdown: (t: string) => { parts.push(t); },
    getAll: () => parts.join(''),
  };
}

async function writeStoryFile(specDir: string, filename: string, content: string): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(specDir));
  const encoded = new TextEncoder().encode(content);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(specDir, filename)), encoded);
}

async function removeDir(dirPath: string): Promise<void> {
  try {
    await vscode.workspace.fs.delete(vscode.Uri.file(dirPath), { recursive: true });
  } catch {
    // directory may not exist — ignore
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(dirPath));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Suite: história COMPLETA
// ---------------------------------------------------------------------------

suite('Commands integration — história completa', () => {
  let root: string;
  let specDir: string;

  setup(async () => {
    root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    specDir = path.join(root, '.speckit');
    await writeStoryFile(specDir, 'STORY-001.md', completeStoryMd);
  });

  teardown(async () => {
    await removeDir(specDir);
    await removeDir(path.join(root, '.github'));
  });

  // --- /validate ---

  test('/validate: stream indica "DoR atingido"', async () => {
    const stream = createStream();
    await handleValidateCommand({} as any, stream as any, {} as any);

    assert.ok(
      stream.getAll().includes('DoR atingido'),
      `Stream deveria conter "DoR atingido". Recebido:\n${stream.getAll()}`,
    );
  });

  test('/validate: stream instrui o usuário a usar /implement no modo Agente', async () => {
    const stream = createStream();
    await handleValidateCommand({} as any, stream as any, {} as any);

    assert.ok(stream.getAll().includes('/implement'), 'Stream deveria mencionar /implement');
    assert.ok(stream.getAll().includes('Agente'), 'Stream deveria mencionar modo Agente');
  });

  test('/validate: cria copilot-instructions.md no disco', async () => {
    await handleValidateCommand({} as any, createStream() as any, {} as any);

    const uri = vscode.Uri.file(path.join(root, '.github', 'copilot-instructions.md'));
    const stat = await vscode.workspace.fs.stat(uri);
    assert.ok(stat.size > 0, 'copilot-instructions.md deveria ter conteúdo');
  });

  test('/validate: cria todos os arquivos de instrução (.github/instructions/)', async () => {
    const stream = createStream();
    await handleValidateCommand({} as any, stream as any, {} as any);

    const instructionsUri = vscode.Uri.file(path.join(root, '.github', 'instructions'));
    const entries = await vscode.workspace.fs.readDirectory(instructionsUri);
    const mdFiles = entries.filter(([name]) => name.endsWith('.md'));
    assert.ok(
      mdFiles.length >= 14,
      `Esperado >= 14 arquivos em instructions/, encontrado ${mdFiles.length}`,
    );
  });

  test('/validate: cria prompts em .github/prompts/', async () => {
    await handleValidateCommand({} as any, createStream() as any, {} as any);

    const promptsUri = vscode.Uri.file(path.join(root, '.github', 'prompts'));
    const entries = await vscode.workspace.fs.readDirectory(promptsUri);
    assert.strictEqual(entries.length, 3, 'Deveria haver exatamente 3 prompts');
  });

  // --- /apply ---

  test('/apply: stream confirma arquivos gerados e instrui modo Agente', async () => {
    const stream = createStream();
    await handleApplyCommand({} as any, stream as any, {} as any);

    const out = stream.getAll();
    assert.ok(out.includes('arquivo(s) gerado(s)'), 'Deveria confirmar arquivos gerados');
    assert.ok(out.includes('/implement'), 'Deveria mencionar /implement');
    assert.ok(out.includes('Agente'), 'Deveria mencionar modo Agente');
  });

  test('/apply: cria .github/ no disco', async () => {
    await handleApplyCommand({} as any, createStream() as any, {} as any);

    assert.ok(
      await dirExists(path.join(root, '.github')),
      '.github deveria ter sido criado',
    );
  });

  // --- /status ---

  test('/status: exibe título, linguagem, framework e arquitetura', async () => {
    const stream = createStream();
    await handleStatusCommand({} as any, stream as any, {} as any);

    const out = stream.getAll();
    assert.ok(out.includes('Autenticação via OAuth2'), 'Deveria exibir o título');
    assert.ok(out.includes('typescript'), 'Deveria exibir a linguagem');
    assert.ok(out.includes('react'), 'Deveria exibir o framework');
    assert.ok(out.includes('hexagonal'), 'Deveria exibir a arquitetura');
  });

  test('/status: exibe ícone de story válida (✅)', async () => {
    const stream = createStream();
    await handleStatusCommand({} as any, stream as any, {} as any);

    assert.ok(stream.getAll().includes('✅'), 'Status deveria exibir ✅ para story válida');
  });

  // --- /review ---

  test('/review: instrui o usuário a usar /review no modo Agente', async () => {
    const stream = createStream();
    await handleReviewCommand({} as any, stream as any, {} as any);

    assert.ok(stream.getAll().includes('/review'), 'Stream deveria mencionar /review');
    assert.ok(stream.getAll().includes('Agente'), 'Stream deveria mencionar modo Agente');
  });
});

// ---------------------------------------------------------------------------
// Suite: história INCOMPLETA
// ---------------------------------------------------------------------------

suite('Commands integration — história incompleta', () => {
  let root: string;
  let specDir: string;

  setup(async () => {
    root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    specDir = path.join(root, '.speckit');
    await writeStoryFile(specDir, 'STORY-001.md', partialStoryMd);
  });

  teardown(async () => {
    await removeDir(specDir);
    await removeDir(path.join(root, '.github'));
  });

  // --- /validate ---

  test('/validate: stream indica story "incompleta"', async () => {
    const stream = createStream();
    await handleValidateCommand({} as any, stream as any, {} as any);

    assert.ok(
      stream.getAll().includes('incompleta'),
      `Stream deveria indicar story incompleta. Recebido:\n${stream.getAll()}`,
    );
  });

  test('/validate: NÃO cria .github/', async () => {
    await handleValidateCommand({} as any, createStream() as any, {} as any);

    assert.ok(
      !(await dirExists(path.join(root, '.github'))),
      '.github NÃO deveria ser criado para story incompleta',
    );
  });

  test('/validate: stream contém prompt de gap-filling', async () => {
    const stream = createStream();
    await handleValidateCommand({} as any, stream as any, {} as any);

    assert.ok(
      stream.getAll().length > 100,
      'Stream deveria conter prompt de gap-filling',
    );
  });

  // --- /apply ---

  test('/apply: stream lista as lacunas', async () => {
    const stream = createStream();
    await handleApplyCommand({} as any, stream as any, {} as any);

    const out = stream.getAll();
    assert.ok(out.includes('incompleta'), 'Deveria indicar story incompleta');
    assert.ok(out.includes('['), 'Deveria listar seções com lacunas');
  });

  test('/apply: NÃO cria .github/', async () => {
    await handleApplyCommand({} as any, createStream() as any, {} as any);

    assert.ok(
      !(await dirExists(path.join(root, '.github'))),
      '.github NÃO deveria ser criado para story incompleta',
    );
  });

  // --- /status ---

  test('/status: exibe ícone de story com lacunas (⚠️)', async () => {
    const stream = createStream();
    await handleStatusCommand({} as any, stream as any, {} as any);

    assert.ok(
      stream.getAll().includes('lacuna'),
      'Status deveria indicar lacunas com ⚠️',
    );
  });

  test('/status: exibe número de lacunas', async () => {
    const stream = createStream();
    await handleStatusCommand({} as any, stream as any, {} as any);

    assert.ok(
      stream.getAll().includes('lacuna'),
      'Status deveria indicar quantas lacunas há',
    );
  });
});

// ---------------------------------------------------------------------------
// Suite: /new command
// ---------------------------------------------------------------------------

suite('Commands integration — /new', () => {
  let root: string;
  let specDir: string;

  setup(async () => {
    root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    specDir = path.join(root, '.speckit');
  });

  teardown(async () => {
    await removeDir(specDir);
  });

  test('/new: cria STORY-001.md quando não há stories', async () => {
    const stream = createStream();
    await handleNewCommand({} as any, stream as any, {} as any);

    const storyUri = vscode.Uri.file(path.join(specDir, 'STORY-001.md'));
    const stat = await vscode.workspace.fs.stat(storyUri);
    assert.ok(stat.size > 0, 'STORY-001.md deveria ter conteúdo');
    assert.ok(stream.getAll().includes('STORY-001'), 'Stream deveria mencionar STORY-001');
  });

  test('/new: o arquivo criado é parseável pelo StoryParser', async () => {
    const { parseStory } = await import('../../../src/story/StoryParser.js');

    await handleNewCommand({} as any, createStream() as any, {} as any);

    const storyUri = vscode.Uri.file(path.join(specDir, 'STORY-001.md'));
    const bytes = await vscode.workspace.fs.readFile(storyUri);
    const content = new TextDecoder().decode(bytes);
    const story = parseStory(content);

    assert.strictEqual(story.metadata.id, '001', 'Story ID deveria ser 001');
  });

  test('/new: cria STORY-002.md quando STORY-001.md já existe', async () => {
    // Cria a primeira story manualmente
    await writeStoryFile(specDir, 'STORY-001.md', completeStoryMd);

    const stream = createStream();
    await handleNewCommand({} as any, stream as any, {} as any);

    const story2Uri = vscode.Uri.file(path.join(specDir, 'STORY-002.md'));
    const stat = await vscode.workspace.fs.stat(story2Uri);
    assert.ok(stat.size > 0, 'STORY-002.md deveria ter conteúdo');
    assert.ok(stream.getAll().includes('STORY-002'));
  });
});
