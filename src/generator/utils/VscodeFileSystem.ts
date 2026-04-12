import { IFileSystem } from './IFileSystem';
import {
  deleteDir,
  deleteFile,
  ensureDir,
  fileExists,
  listDir,
  readFile,
  writeFile,
} from './fileSystem';

export const vscodeFileSystem: IFileSystem = {
  ensureDir,
  writeFile,
  readFile,
  fileExists,
  listDir,
  deleteFile,
  deleteDir,
};
