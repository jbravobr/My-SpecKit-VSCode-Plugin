import type { ExtractedFile, ImportExtractor } from './ExtractorTypes';

/**
 * Partial Python extractor based on line-oriented, AST-aware regex heuristics.
 *
 * @partial Known limitations:
 * - Basic docstring stripping only handles triple-quoted strings that start at line beginning.
 * - Relative imports with leading dots are not extracted by the requested regex.
 * - Function calls inside methods are intentionally not emitted as INSTANTIATES because they are ambiguous.
 * - Dynamic imports without string literals are emitted as ambiguous placeholder targets.
 */
export class PythonImportExtractor implements ImportExtractor {
  readonly language = 'python';
  readonly version = '1';
  readonly partial = true;

  supports(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.py');
  }

  extract(filePath: string, content: string, workspaceRoot: string): ExtractedFile {
    try {
      const sanitized = this.stripCommentsAndDocstrings(content);
      const symbols = this.extractSymbols(sanitized);
      const edges: ExtractedFile['edges'] = [];

      this.extractDirectImports(sanitized, edges);
      this.extractFromImports(sanitized, edges);
      this.extractInheritance(sanitized, edges);
      this.extractDynamicImports(sanitized, edges);

      return {
        nodeId: this.normalizeNodeId(filePath, workspaceRoot),
        language: this.language,
        symbols,
        edges,
      };
    } catch (error) {
      console.warn(`PythonImportExtractor failed for ${filePath}: ${String(error)}`);
      return this.emptyResult(filePath, workspaceRoot);
    }
  }

  private extractDirectImports(content: string, edges: ExtractedFile['edges']): void {
    const importRegex = /^\s*import\s+([\w.]+)(?:\s+as\s+\w+)?/gm;
    for (const match of content.matchAll(importRegex)) {
      const target = match[1];
      if (target !== undefined) {
        edges.push({ to: target, kind: 'IMPORTS', edgeKind: 'direct', confidence: 'INFERRED' });
      }
    }
  }

  private extractFromImports(content: string, edges: ExtractedFile['edges']): void {
    const fromRegex = /^\s*from\s+([\w.]+)\s+import\s+(.+)$/gm;
    for (const match of content.matchAll(fromRegex)) {
      const target = match[1];
      if (target !== undefined) {
        edges.push({ to: target, kind: 'IMPORTS', edgeKind: 'from', confidence: 'INFERRED' });
      }
    }
  }

  private extractInheritance(content: string, edges: ExtractedFile['edges']): void {
    const classRegex = /^\s*class\s+(\w+)\s*\(([^)]+)\)\s*:/gm;
    for (const match of content.matchAll(classRegex)) {
      const bases = match[2];
      if (bases === undefined) {
        continue;
      }

      for (const base of bases.split(',')) {
        const target = base.trim().replace(/\(.*$/, '');
        if (target.length > 0) {
          edges.push({ to: target, kind: 'INHERITS', edgeKind: 'extends', confidence: 'INFERRED' });
        }
      }
    }
  }

  private extractDynamicImports(content: string, edges: ExtractedFile['edges']): void {
    const dynamicRegex = /\b(?:__import__|importlib\.import_module)\(\s*(?:['"]([^'"]+)['"])?/g;
    for (const match of content.matchAll(dynamicRegex)) {
      const target = match[1] ?? 'dynamic-python-import';
      edges.push({ to: target, kind: 'IMPORTS', edgeKind: 'dynamic', confidence: 'AMBIGUOUS' });
    }
  }

  private extractSymbols(content: string): string[] {
    const symbols: string[] = [];
    const symbolRegex = /^(?:class|def)\s+(\w+)/gm;
    for (const match of content.matchAll(symbolRegex)) {
      const symbol = match[1];
      if (symbol !== undefined) {
        symbols.push(symbol);
      }
    }
    return symbols;
  }

  private stripCommentsAndDocstrings(content: string): string {
    const lines = content.split(/\r?\n/);
    let inDocstring: '"""' | "'''" | undefined;

    return lines
      .map((line) => {
        const trimmed = line.trimStart();
        if (inDocstring !== undefined) {
          if (trimmed.includes(inDocstring)) {
            inDocstring = undefined;
          }
          return '';
        }

        if (trimmed.startsWith('#')) {
          return '';
        }

        const quote = trimmed.startsWith('"""')
          ? '"""'
          : trimmed.startsWith("'''")
            ? "'''"
            : undefined;
        if (quote !== undefined) {
          const rest = trimmed.slice(3);
          if (!rest.includes(quote)) {
            inDocstring = quote;
          }
          return '';
        }

        return line;
      })
      .join('\n');
  }

  private normalizeNodeId(filePath: string, workspaceRoot: string): string {
    const normalizedFile = filePath.replace(/\\/g, '/');
    const normalizedRoot = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    const prefix = `${normalizedRoot}/`;
    return normalizedFile.startsWith(prefix) ? normalizedFile.slice(prefix.length) : normalizedFile;
  }

  private emptyResult(filePath: string, workspaceRoot: string): ExtractedFile {
    return {
      nodeId: this.normalizeNodeId(filePath, workspaceRoot),
      language: this.language,
      symbols: [],
      edges: [],
    };
  }
}
