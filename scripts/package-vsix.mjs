import { spawnSync } from 'child_process';
import console from 'console';
import { resolve } from 'path';
import process from 'process';
import {
    ensureCleanVsixOutput,
    formatVsixPath,
    getVsixOutputPath,
} from './lib/vsix.mjs';

const vsixPath = getVsixOutputPath();
ensureCleanVsixOutput(vsixPath);

const vsceCliPath = resolve(process.cwd(), 'node_modules', '@vscode', 'vsce', 'vsce');

const result = spawnSync(
  process.execPath,
  [
    vsceCliPath,
    'package',
    '--no-dependencies',
    '--allow-missing-repository',
    '--skip-license',
    '--baseContentUrl',
    'https://github.com/jbravobr/My-SpecKit-VSCode-Plugin/blob/main/',
    '--out',
    vsixPath,
  ],
  {
    stdio: 'inherit',
    shell: false,
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`VSIX gerado em ${formatVsixPath(vsixPath)}`);
