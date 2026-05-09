import { mkdir, writeFile, readFile, access, readdir, unlink, rm } from 'node:fs/promises';
import { IFileSystem } from '../../../../src/generator/utils/IFileSystem';

export const nodeFileSystem: IFileSystem = {
  async ensureDir(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true });
  },

  async writeFile(filePath: string, content: string): Promise<void> {
    await writeFile(filePath, content, 'utf-8');
  },

  async readFile(filePath: string): Promise<string> {
    return readFile(filePath, 'utf-8');
  },

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  },

  async listDir(dirPath: string): Promise<string[]> {
    try {
      return await readdir(dirPath);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return [];
      throw err;
    }
  },

  async deleteFile(filePath: string): Promise<void> {
    await unlink(filePath);
  },

  async deleteDir(dirPath: string): Promise<void> {
    await rm(dirPath, { recursive: true, force: true });
  },
};
