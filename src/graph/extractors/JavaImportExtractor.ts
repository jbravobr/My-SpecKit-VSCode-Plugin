import type { ExtractedFile, ImportExtractor } from './ExtractorTypes';

interface SplitTypeName {
  name: string;
  ambiguous: boolean;
}

/**
 * Partial Java extractor based on regex heuristics over comment-stripped source.
 *
 * @partial Known limitations:
 * - Comment stripping is regex-based and can be confused by comment markers inside string literals.
 * - Complex nested generic declarations are approximated; commas inside generics mark affected edges ambiguous.
 * - Instantiation targets may be inner classes, factories or builders, so `new` edges remain inferred.
 * - Symbol extraction uses simple brace-depth tracking and can miss unusual top-level declarations.
 */
export class JavaImportExtractor implements ImportExtractor {
  readonly language = 'java';
  readonly version = '1';
  readonly partial = true;

  supports(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.java');
  }

  extract(filePath: string, content: string, workspaceRoot: string): ExtractedFile {
    try {
      const sanitized = this.stripComments(content);
      const symbols = this.extractSymbols(sanitized);
      const edges: ExtractedFile['edges'] = [];

      this.extractImports(sanitized, edges);
      this.extractExtends(sanitized, edges);
      this.extractImplements(sanitized, edges);
      this.extractInstantiations(sanitized, edges);

      return {
        nodeId: this.normalizeNodeId(filePath, workspaceRoot),
        language: this.language,
        symbols,
        edges,
      };
    } catch (error) {
      console.warn(`JavaImportExtractor failed for ${filePath}: ${String(error)}`);
      return this.emptyResult(filePath, workspaceRoot);
    }
  }

  private extractImports(content: string, edges: ExtractedFile['edges']): void {
    const importRegex = /^\s*import\s+(static\s+)?([\w.]+(?:\.\*)?);/gm;
    for (const match of content.matchAll(importRegex)) {
      const target = match[2];
      if (target !== undefined) {
        edges.push({
          to: target,
          kind: 'IMPORTS',
          edgeKind: 'direct',
          confidence: target.endsWith('.*') ? 'AMBIGUOUS' : 'INFERRED',
        });
      }
    }
  }

  private extractExtends(content: string, edges: ExtractedFile['edges']): void {
    const extendsRegex =
      /(?:public|private|protected)?\s*(?:abstract\s+)?class\s+(\w+)(?:<[^>]*>)?\s+extends\s+(\w+(?:<[^>]*>)?)/g;
    for (const match of content.matchAll(extendsRegex)) {
      const rawTarget = match[2];
      if (rawTarget !== undefined) {
        edges.push({
          to: this.stripGenerics(rawTarget),
          kind: 'INHERITS',
          edgeKind: 'extends',
          confidence: rawTarget.includes(',') ? 'AMBIGUOUS' : 'INFERRED',
        });
      }
    }
  }

  private extractImplements(content: string, edges: ExtractedFile['edges']): void {
    const implementsRegex =
      /class\s+\w+(?:<[^>]*>)?\s+(?:extends\s+\w+(?:<[^>]*>)?\s+)?implements\s+([\w,\s<>]+?)\s*\{/g;
    for (const match of content.matchAll(implementsRegex)) {
      const interfaces = match[1];
      if (interfaces === undefined) {
        continue;
      }

      for (const typeName of this.splitTypeList(interfaces)) {
        edges.push({
          to: this.stripGenerics(typeName.name),
          kind: 'INHERITS',
          edgeKind: 'implements',
          confidence: typeName.ambiguous ? 'AMBIGUOUS' : 'INFERRED',
        });
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
      if (braceDepth === 0) {
        const match = line.match(
          /^\s*(?:(?:public|private|protected|abstract|final|static)\s+)*(?:class|interface|enum|record)\s+(\w+)/,
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

  private splitTypeList(input: string): SplitTypeName[] {
    const result: SplitTypeName[] = [];
    let current = '';
    let depth = 0;
    let ambiguous = false;

    for (const char of input) {
      if (char === '<') {
        depth += 1;
      } else if (char === '>') {
        depth = Math.max(0, depth - 1);
      } else if (char === ',' && depth === 0) {
        this.pushTypeName(result, current, ambiguous);
        current = '';
        ambiguous = false;
        continue;
      } else if (char === ',' && depth > 0) {
        ambiguous = true;
      }
      current += char;
    }

    this.pushTypeName(result, current, ambiguous);
    return result;
  }

  private pushTypeName(result: SplitTypeName[], rawName: string, ambiguous: boolean): void {
    const name = rawName.trim();
    if (name.length > 0) {
      result.push({ name, ambiguous });
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
