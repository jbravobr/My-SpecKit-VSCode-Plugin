import * as path from 'path';

import type { IFileSystem } from '../generator/utils/IFileSystem';

export class ContextManager {
  private readonly contextPath: string;

  constructor(
    private readonly workspaceRoot: string,
    private readonly fs: IFileSystem,
  ) {
    this.contextPath = path.join(workspaceRoot, '.speckit', 'context.json');
  }

  async list(): Promise<string[]> {
    try {
      const exists = await this.fs.fileExists(this.contextPath);
      if (!exists) return [];
      const content = await this.fs.readFile(this.contextPath);
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async add(relativePath: string): Promise<'added' | 'already' | 'outside' | 'not-found'> {
    const normalized = relativePath.replace(/\\/g, '/');
    if (normalized.includes('..')) return 'outside';

    const fullPath = path.join(this.workspaceRoot, normalized);
    const exists = await this.fs.fileExists(fullPath);
    if (!exists) return 'not-found';

    const current = await this.list();
    if (current.includes(normalized)) return 'already';

    current.push(normalized);
    await this.save(current);
    return 'added';
  }

  async remove(relativePath: string): Promise<boolean> {
    const normalized = relativePath.replace(/\\/g, '/');
    const current = await this.list();
    const idx = current.indexOf(normalized);
    if (idx === -1) return false;
    current.splice(idx, 1);
    await this.save(current);
    return true;
  }

  async clear(): Promise<void> {
    await this.save([]);
  }

  private async save(files: string[]): Promise<void> {
    await this.fs.ensureDir(path.dirname(this.contextPath));
    await this.fs.writeFile(this.contextPath, JSON.stringify(files, null, 2));
  }
}
