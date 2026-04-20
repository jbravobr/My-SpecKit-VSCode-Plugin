import type { AuditLogger } from '../../workflow/AuditLogger';
import { IFileSystem } from './IFileSystem';

/**
 * Transactional write helper — tracks files written so they can be rolled back
 * on failure, ensuring all-or-nothing semantics for multi-file generation.
 */
export class WriteTransaction {
  private readonly fs: IFileSystem;
  private readonly rootPrefix: string;
  private readonly audit?: AuditLogger;
  private readonly _written: string[] = [];
  private readonly _fullPaths: string[] = [];
  private readonly _errors: string[] = [];

  constructor(fs: IFileSystem, workspaceRoot: string, audit?: AuditLogger) {
    this.fs = fs;
    this.rootPrefix = workspaceRoot;
    this.audit = audit;
  }

  /** Write a file, tracking its normalized path on success or error message on failure. */
  async write(filePath: string, content: string): Promise<void> {
    try {
      await this.fs.writeFile(filePath, content);
      this._fullPaths.push(filePath);
      // Normalize to relative forward-slash path for output
      const normalized = filePath
        .replace(/\\/g, '/')
        .replace(this.rootPrefix.replace(/\\/g, '/'), '')
        .replace(/^\//, '');
      this._written.push(normalized);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this._errors.push(`${filePath}: ${msg}`);
    }
  }

  /** Returns the list of successfully written relative paths. */
  get written(): readonly string[] {
    return this._written;
  }

  /** Returns the list of error messages from failed writes. */
  get errors(): readonly string[] {
    return this._errors;
  }

  /** Returns true if any write failed. */
  get hasErrors(): boolean {
    return this._errors.length > 0;
  }

  /**
   * Commit: returns written paths if no errors, otherwise rolls back and throws.
   * Ensures all-or-nothing semantics per CLAUDE.md idempotency requirement.
   */
  async commit(): Promise<string[]> {
    if (this._errors.length === 0) {
      if (this.audit) {
        for (const relPath of this._written) {
          try {
            await this.audit.log('file_write', relPath);
          } catch {
            /* never break flow */
          }
        }
      }
      return [...this._written];
    }
    await this.rollback();
    throw new Error(
      `Falha ao gravar arquivos (${this._errors.length} erro(s), rollback executado):\n${this._errors.join('\n')}`,
    );
  }

  /** Delete all successfully written files (best-effort — ignores delete failures). */
  async rollback(): Promise<void> {
    const deletePromises = this._fullPaths.map(async (fullPath) => {
      try {
        await this.fs.deleteFile(fullPath);
      } catch {
        // best-effort: file may already not exist
      }
    });
    await Promise.all(deletePromises);
  }
}
