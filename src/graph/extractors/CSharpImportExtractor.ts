import type { ExtractedFile, ImportExtractor } from './ExtractorTypes';

/**
 * Partial C# extractor based on regex heuristics over comment-stripped source.
 *
 * @partial Known limitations:
 * - Comment stripping is regex-based and can be confused by comment markers inside string literals.
 * - Partial classes are not unified across files; each file is extracted independently.
 * - Base classes and interfaces after `:` cannot be distinguished reliably, so inheritance edges are ambiguous.
 * - Symbol extraction uses simple brace-depth tracking and can miss unusual namespace/type layouts.
 */
export class CSharpImportExtractor implements ImportExtractor {
  readonly language = 'csharp';
  readonly version = '1';
  readonly partial = true;

  supports(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.cs');
  }

  extract(filePath: string, content: string, workspaceRoot: string): ExtractedFile {
    try {
      const sanitized = this.stripComments(content);
      const symbols = this.extractSymbols(sanitized);
      const edges: ExtractedFile['edges'] = [];

      this.extractUsings(sanitized, edges);
      this.extractInheritance(sanitized, edges);
      this.extractInstantiations(sanitized, edges);

      return {
        nodeId: this.normalizeNodeId(filePath, workspaceRoot),
        language: this.language,
        symbols,
        edges,
      };
    } catch (error) {
      console.warn(`CSharpImportExtractor failed for ${filePath}: ${String(error)}`);
      return this.emptyResult(filePath, workspaceRoot);
    }
  }

  private extractUsings(content: string, edges: ExtractedFile['edges']): void {
    const usingRegex = /^\s*using\s+(?:static\s+)?([\w.]+);/gm;
    const globalUsingRegex = /^\s*global\s+using\s+(?:static\s+)?([\w.]+);/gm;

    for (const match of content.matchAll(usingRegex)) {
      const target = match[1];
      if (target !== undefined) {
        edges.push({ to: target, kind: 'IMPORTS', edgeKind: 'using', confidence: 'INFERRED' });
      }
    }

    for (const match of content.matchAll(globalUsingRegex)) {
      const target = match[1];
      if (target !== undefined) {
        edges.push({ to: target, kind: 'IMPORTS', edgeKind: 'using', confidence: 'INFERRED' });
      }
    }
  }

  private extractInheritance(content: string, edges: ExtractedFile['edges']): void {
    const classRegex =
      /(?:(?:public|internal|private|protected|sealed|abstract|static|partial)\s+)+(?:partial\s+)?class\s+(\w+)(?:<[^>]*>)?\s*:\s*([\w,\s<>.]+?)\s*(?:where|\{)/g;
    for (const match of content.matchAll(classRegex)) {
      const inheritanceList = match[2];
      if (inheritanceList === undefined) {
        continue;
      }

      for (const item of this.splitTypeList(inheritanceList)) {
        const target = this.stripGenerics(item);
        if (target.length > 0) {
          edges.push({
            to: target,
            kind: 'INHERITS',
            edgeKind: 'extends-or-implements',
            confidence: 'AMBIGUOUS',
          });
        }
      }
    }
  }

  private extractInstantiations(content: string, edges: ExtractedFile['edges']): void {
    const newRegex = /\bnew\s+(\w+)\s*[<(]/g;
    for (const match of content.matchAll(newRegex)) {
      const target = match[1];
      if (target !== undefined) {
        edges.push({
          to: target,
          kind: 'INSTANTIATES',
          edgeKind: 'direct',
          confidence: 'INFERRED',
        });
      }
    }
  }

  private extractSymbols(content: string): string[] {
    const symbols: string[] = [];
    let braceDepth = 0;

    for (const line of content.split(/\r?\n/)) {
      if (braceDepth <= 1) {
        const match = line.match(
          /^\s*(?:(?:public|internal|private|protected|sealed|abstract|static|partial)\s+)*(?:class|interface|struct|record|enum)\s+(\w+)/,
        );
        const symbol = match?.[1];
        if (symbol !== undefined) {
          symbols.push(symbol);
        }
      }
      braceDepth += this.countChar(line, '{') - this.countChar(line, '}');
      braceDepth = Math.max(0, braceDepth);
    }

    return symbols;
  }

  private splitTypeList(input: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;

    for (const char of input) {
      if (char === '<') {
        depth += 1;
      } else if (char === '>') {
        depth = Math.max(0, depth - 1);
      } else if (char === ',' && depth === 0) {
        this.pushTypeName(result, current);
        current = '';
        continue;
      }
      current += char;
    }

    this.pushTypeName(result, current);
    return result;
  }

  private pushTypeName(result: string[], rawName: string): void {
    const name = rawName.trim();
    if (name.length > 0) {
      result.push(name);
    }
  }

  private stripGenerics(typeName: string): string {
    return typeName.replace(/<.*>/g, '').trim();
  }

  private stripComments(content: string): string {
    return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  }

  private countChar(input: string, char: string): number {
    return [...input].filter((candidate) => candidate === char).length;
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
