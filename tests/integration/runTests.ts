import { runTests } from '@vscode/test-electron';
import * as path from 'path';

async function main() {
  try {
    // __dirname when compiled: <project>/out/integration/tests/integration
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../..'); // → <project>/
    const extensionTestsPath = path.resolve(__dirname, './suite/index');     // → .../suite/index

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        path.resolve(__dirname, '../../../../tests/integration/workspace'), // → <project>/tests/integration/workspace
        '--disable-extensions',
      ],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
