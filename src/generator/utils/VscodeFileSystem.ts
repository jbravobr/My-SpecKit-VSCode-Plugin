import { IFileSystem } from './IFileSystem';
import { ensureDir, writeFile, readFile, fileExists } from './fileSystem';

export const vscodeFileSystem: IFileSystem = { ensureDir, writeFile, readFile, fileExists };
