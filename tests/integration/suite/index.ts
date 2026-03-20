import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60000 });

  // __dirname when compiled: <project>/out/integration/tests/integration/suite
  const testsRoot = path.resolve(__dirname, '../tests'); // → .../integration/tests
  const files = await glob('**/*.integration.test.js', { cwd: testsRoot });

  files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((resolve, reject) => {
    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}
