import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { dirname, join, resolve } from 'path';
import process from 'process';

export const FORBIDDEN_VSIX_PATHS = [
  'extension/coverage/',
  'extension/assets/diagrams/',
  'extension/assets/presentation/',
  'extension/tests/',
  'extension/src/',
  'extension/scripts/',
  'extension/publish/',
  'extension/markdown-to-pdf/',
  'extension/.venv/',
  'extension/venv/',
  'extension/env/',
  'extension/__pycache__/',
  'extension/.vscode/',
  'extension/.vscode-test/',
];

export function getPackageMetadata(rootDir = process.cwd()) {
  const packageJsonPath = resolve(rootDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return {
    rootDir: resolve(rootDir),
    packageJsonPath,
    name: packageJson.name,
    version: packageJson.version,
  };
}

export function getVsixOutputPath(rootDir = process.cwd()) {
  const { rootDir: resolvedRoot, name, version } = getPackageMetadata(rootDir);
  return resolve(resolvedRoot, 'publish', version, `${name}-${version}.vsix`);
}

export function ensureCleanVsixOutput(vsixPath) {
  mkdirSync(dirname(vsixPath), { recursive: true });
  if (existsSync(vsixPath)) {
    rmSync(vsixPath);
  }
}

export function readZipEntries(zipPath) {
  const buffer = readFileSync(zipPath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];

  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x02014b50) {
      throw new Error(`Central directory header inválido no offset ${offset}`);
    }

    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    entries.push(buffer.toString('utf8', fileNameStart, fileNameEnd));

    offset = fileNameEnd + extraFieldLength + fileCommentLength;
  }

  return entries;
}

export function findForbiddenEntries(entries, forbiddenPrefixes = FORBIDDEN_VSIX_PATHS) {
  return entries.filter((entry) => forbiddenPrefixes.some((prefix) => entry.startsWith(prefix)));
}

export function assertNoForbiddenEntries(entries, forbiddenPrefixes = FORBIDDEN_VSIX_PATHS) {
  const forbiddenEntries = findForbiddenEntries(entries, forbiddenPrefixes);
  if (forbiddenEntries.length > 0) {
    throw new Error(
      ['VSIX contém conteúdo proibido:', ...forbiddenEntries.map((entry) => ` - ${entry}`)].join(
        '\n',
      ),
    );
  }
}

export function formatVsixPath(vsixPath) {
  return vsixPath.split('\\').join('/');
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error('Registro de fim do diretório central não encontrado no VSIX');
}

export function getVsceBinPath(rootDir = process.cwd()) {
  return process.platform === 'win32'
    ? join(resolve(rootDir), 'node_modules', '.bin', 'vsce.cmd')
    : join(resolve(rootDir), 'node_modules', '.bin', 'vsce');
}
