import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { generateCopilotConfig } from '../../../src/generator/CopilotConfigGenerator';
import { vscodeFileSystem } from '../../../src/generator/utils/VscodeFileSystem';
import { parseStory } from '../../../src/story/StoryParser';

// __dirname when compiled: <project>/out/integration/tests/integration/tests
const fixturesDir = path.resolve(__dirname, '../../../../../tests/fixtures');
const completeStoryMd = readFileSync(path.join(fixturesDir, 'story-complete.md'), 'utf-8');
const completeStory = parseStory(completeStoryMd);

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

suite('generateCopilotConfig integration', () => {
  const root = vscode.workspace.workspaceFolders![0].uri.fsPath;

  teardown(async () => {
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(path.join(root, '.github')), {
        recursive: true,
      });
    } catch {
      // directory may not exist
    }
  });

  test('creates expected .github/ structure on disk', async () => {
    const files = await generateCopilotConfig(root, completeStory, vscodeFileSystem);

    assert.ok(files.length >= 6, `Expected >= 6 files, got ${files.length}`);
    assert.ok(files.includes('.github/copilot-instructions.md'), 'Missing copilot-instructions.md');
    assert.ok(await dirExists(path.join(root, '.github', 'skills')), 'Missing .github/skills');
    assert.ok(await dirExists(path.join(root, '.github', 'agents')), 'Missing .github/agents');
    assert.ok(await dirExists(path.join(root, '.github', 'prompts')), 'Missing .github/prompts');

    const agentFiles = await listFileNames(path.join(root, '.github', 'agents'));
    assert.ok(
      agentFiles.includes('speckit-implementador.agent.md'),
      'Missing speckit-implementador.agent.md',
    );
    assert.ok(agentFiles.includes('speckit-revisor.agent.md'), 'Missing speckit-revisor.agent.md');

    const promptFiles = await listFileNames(path.join(root, '.github', 'prompts'));
    assert.ok(promptFiles.includes('run.prompt.md'), 'Missing run.prompt.md');
  });

  test('copilot-instructions.md has content on disk', async () => {
    await generateCopilotConfig(root, completeStory, vscodeFileSystem);

    const uri = vscode.Uri.file(path.join(root, '.github', 'copilot-instructions.md'));
    const bytes = await vscode.workspace.fs.readFile(uri);
    assert.ok(bytes.length > 0, 'copilot-instructions.md is empty');
  });
});
