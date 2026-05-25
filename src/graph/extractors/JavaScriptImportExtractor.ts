import * as ts from 'typescript';

import type { ExtractedFile, ImportExtractor } from './ExtractorTypes';
import { extractWithTypeScriptAst } from './TypeScriptImportExtractor';

const JAVASCRIPT_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs'];

export class JavaScriptImportExtractor implements ImportExtractor {
  readonly language = 'javascript';
  readonly version = '1';
  readonly partial = false;

  supports(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    return JAVASCRIPT_EXTENSIONS.some((extension) => normalized.endsWith(extension));
  }

  extract(filePath: string, content: string, workspaceRoot: string): ExtractedFile {
    return extractWithTypeScriptAst(filePath, content, workspaceRoot, {
      language: this.language,
      scriptKind: this.scriptKindFor(filePath),
    });
  }

  private scriptKindFor(filePath: string): ts.ScriptKind {
    return filePath.replace(/\\/g, '/').toLowerCase().endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.JS;
  }
}
