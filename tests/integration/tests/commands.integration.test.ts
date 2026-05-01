/**
 * Integration tests for SpecKit command handlers running inside a real VS Code host.
 *
 * No DI mocking — all commands use the default vscodeFileSystem and vscodeWorkspace adapters.
 * Each suite writes story fixtures to the integration workspace, calls the handler,
 * then asserts both stream output and disk state.
 */
import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { handleNewCommand } from '../../../src/participant/commands/newCommand';
import { handleStatusCommand } from '../../../src/participant/commands/statusCommand';
import { handleValidateCommand } from '../../../src/participant/commands/validateCommand';

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
    markdown: (t: string) => {
      parts.push(t);
    },
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

async function listFileNames(dirPath: string): Promise<string[]> {
  const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath));
  return entries.filter(([, type]) => type === vscode.FileType.File).map(([name]) => name);
}

async function findGeneratedFile(
  dirPath: string,
  prefix: string,
  suffix: string,
): Promise<string | undefined> {
  const fileNames = await listFileNames(dirPath);
  return fileNames.find((name) => name.startsWith(prefix) && name.endsWith(suffix));
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

  test('/validate: stream instrui o usuário a abrir o agente implementador', async () => {
    const stream = createStream();
    await handleValidateCommand({} as any, stream as any, {} as any);

    assert.ok(
      stream.getAll().includes('speckit-implementador'),
      'Stream deveria mencionar o agente implementador',
    );
    assert.ok(stream.getAll().includes('Copilot Chat'), 'Stream deveria mencionar o Copilot Chat');
  });

  test('/validate: cria copilot-instructions.md no disco', async () => {
    await handleValidateCommand({} as any, createStream() as any, {} as any);

    const uri = vscode.Uri.file(path.join(root, '.github', 'copilot-instructions.md'));
    const stat = await vscode.workspace.fs.stat(uri);
    assert.ok(stat.size > 0, 'copilot-instructions.md deveria ter conteúdo');
  });

  test('/validate: cria a estrutura atual de configuração em .github/', async () => {
    const stream = createStream();
    await handleValidateCommand({} as any, stream as any, {} as any);

    assert.ok(await dirExists(path.join(root, '.github', 'skills')), 'skills/ deveria existir');
    assert.ok(await dirExists(path.join(root, '.github', 'agents')), 'agents/ deveria existir');
    assert.ok(await dirExists(path.join(root, '.github', 'prompts')), 'prompts/ deveria existir');

    const skillFiles = await listFileNames(
      path.join(root, '.github', 'skills', 'speckit-baseline'),
    );
    assert.ok(skillFiles.includes('SKILL.md'), 'speckit-baseline/SKILL.md deveria existir');

    const stackSkillFiles = await listFileNames(
      path.join(root, '.github', 'skills', 'speckit-stack'),
    );
    assert.ok(stackSkillFiles.includes('SKILL.md'), 'speckit-stack/SKILL.md deveria existir');

    const agentFiles = await listFileNames(path.join(root, '.github', 'agents'));
    assert.ok(
      agentFiles.includes('speckit-implementador.agent.md'),
      'Agente implementador deveria existir',
    );
    assert.ok(agentFiles.includes('speckit-revisor.agent.md'), 'Agente revisor deveria existir');
  });

  test('/validate: cria prompts em .github/prompts/', async () => {
    await handleValidateCommand({} as any, createStream() as any, {} as any);

    const entries = await listFileNames(path.join(root, '.github', 'prompts'));
    assert.deepStrictEqual(entries, ['run.prompt.md'], 'Deveria haver apenas o prompt principal');
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

    assert.ok(stream.getAll().length > 100, 'Stream deveria conter prompt de gap-filling');
  });

  // --- /status ---

  test('/status: exibe ícone de story com lacunas (⚠️)', async () => {
    const stream = createStream();
    await handleStatusCommand({} as any, stream as any, {} as any);

    assert.ok(stream.getAll().includes('lacuna'), 'Status deveria indicar lacunas com ⚠️');
  });

  test('/status: exibe número de lacunas', async () => {
    const stream = createStream();
    await handleStatusCommand({} as any, stream as any, {} as any);

    assert.ok(stream.getAll().includes('lacuna'), 'Status deveria indicar quantas lacunas há');
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

  test('/new: cria spec com ID timestampado quando não há stories', async () => {
    const stream = createStream();
    await handleNewCommand({} as any, stream as any, {} as any);

    const generatedFile = await findGeneratedFile(specDir, 'US-', '.md');
    assert.ok(generatedFile, 'A story deveria ter sido criada');
    assert.match(generatedFile!, /^US-[A-Z0-9]{1,10}-\d{8}-\d{4}\.md$/);

    const storyUri = vscode.Uri.file(path.join(specDir, generatedFile!));
    const stat = await vscode.workspace.fs.stat(storyUri);
    assert.ok(stat.size > 0, `${generatedFile} deveria ter conteúdo`);
    assert.ok(
      stream.getAll().includes(generatedFile!.replace('.md', '')),
      'Stream deveria mencionar o ID gerado',
    );
  });

  test('/new: o arquivo criado é parseável pelo StoryParser', async () => {
    const { parseStory } = await import('../../../src/story/StoryParser.js');

    await handleNewCommand({} as any, createStream() as any, {} as any);

    const generatedFile = await findGeneratedFile(specDir, 'US-', '.md');
    assert.ok(generatedFile, 'A story deveria ter sido criada');

    const storyUri = vscode.Uri.file(path.join(specDir, generatedFile!));
    const bytes = await vscode.workspace.fs.readFile(storyUri);
    const content = new TextDecoder().decode(bytes);
    const story = parseStory(content);

    assert.match(
      story.metadata.id,
      /^US-[A-Z0-9]{1,10}-\d{8}-\d{4}$/,
      'Story ID deveria usar o formato atual',
    );
  });

  test('/new: evita colisão quando já existe story com timestamp atual', async () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const existingId = `US-WORKSPACE-${yyyy}${mm}${dd}-${hh}${min}.md`;
    await writeStoryFile(specDir, existingId, completeStoryMd);

    const stream = createStream();
    await handleNewCommand({} as any, stream as any, {} as any);

    const generatedFile = (await listFileNames(specDir)).find(
      (name) => name !== existingId && name.startsWith('US-') && name.endsWith('.md'),
    );
    assert.ok(generatedFile, 'Uma nova story deveria ter sido criada');
    assert.notStrictEqual(generatedFile, existingId, 'O ID gerado não deveria colidir');
    assert.match(generatedFile!, /^US-[A-Z0-9]{1,10}-\d{8}-\d{4}\.md$/);
    assert.ok(stream.getAll().includes(generatedFile!.replace('.md', '')));
  });
});
