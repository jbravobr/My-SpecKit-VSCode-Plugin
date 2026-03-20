import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { generateCopilotConfig } from '../../../src/generator/CopilotConfigGenerator';
import { vscodeFileSystem } from '../../../src/generator/utils/VscodeFileSystem';
import { parseStory } from '../../../src/story/StoryParser';
import { readFileSync } from 'fs';

// __dirname when compiled: <project>/out/integration/tests/integration/tests
const fixturesDir = path.resolve(__dirname, '../../../../../tests/fixtures');
const completeStoryMd = readFileSync(path.join(fixturesDir, 'story-complete.md'), 'utf-8');
const completeStory = parseStory(completeStoryMd);

suite('generateCopilotConfig integration', () => {
  const root = vscode.workspace.workspaceFolders![0].uri.fsPath;

  teardown(async () => {
    try {
      await vscode.workspace.fs.delete(
        vscode.Uri.file(path.join(root, '.github')),
        { recursive: true },
      );
    } catch {
      // directory may not exist
    }
  });

  test('creates expected .github/ structure on disk', async () => {
    const files = await generateCopilotConfig(root, completeStory, vscodeFileSystem);

    assert.ok(files.length >= 18, `Expected >= 18 files, got ${files.length}`);
    assert.ok(
      files.includes('.github/copilot-instructions.md'),
      'Missing copilot-instructions.md',
    );
  });

  test('copilot-instructions.md has content on disk', async () => {
    await generateCopilotConfig(root, completeStory, vscodeFileSystem);

    const uri = vscode.Uri.file(path.join(root, '.github', 'copilot-instructions.md'));
    const bytes = await vscode.workspace.fs.readFile(uri);
    assert.ok(bytes.length > 0, 'copilot-instructions.md is empty');
  });
});
