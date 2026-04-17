import { spawnSync } from 'child_process';
import console from 'console';
import process from 'process';
import {
    ensureCleanVsixOutput,
    formatVsixPath,
    getVsceBinPath,
    getVsixOutputPath,
} from './lib/vsix.mjs';

const vsixPath = getVsixOutputPath();
ensureCleanVsixOutput(vsixPath);

const result = spawnSync(
  getVsceBinPath(),
  [
    'package',
    '--no-dependencies',
    '--allow-missing-repository',
    '--skip-license',
    '--out',
    vsixPath,
  ],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`VSIX gerado em ${formatVsixPath(vsixPath)}`);
