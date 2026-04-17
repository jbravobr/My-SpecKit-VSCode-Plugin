import console from 'console';
import { existsSync } from 'fs';
import process from 'process';
import {
    assertNoForbiddenEntries,
    formatVsixPath,
    getVsixOutputPath,
    readZipEntries,
} from './lib/vsix.mjs';

const vsixPath = process.argv[2] ?? getVsixOutputPath();

if (!existsSync(vsixPath)) {
  console.error(`VSIX não encontrado: ${formatVsixPath(vsixPath)}`);
  process.exit(1);
}

const entries = readZipEntries(vsixPath);
assertNoForbiddenEntries(entries);

console.log(`VSIX validado com sucesso: ${formatVsixPath(vsixPath)}`);
