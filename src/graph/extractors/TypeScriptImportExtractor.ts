import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import type { EdgeConfidence, EdgeKind } from '../types';
import type { ExtractedFile, ImportExtractor } from './ExtractorTypes';

const TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const RESOLUTION_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.d.ts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
];
const INDEX_CANDIDATES = RESOLUTION_EXTENSIONS.map((extension) => `index${extension}`);

interface AstExtractionOptions {
  readonly language: string;
  readonly scriptKind: ts.ScriptKind;
}

type ExtractedEdge = ExtractedFile['edges'][number];

export class TypeScriptImportExtractor implements ImportExtractor {
  readonly language = 'typescript';
  readonly version = '1';
  readonly partial = false;

  supports(filePath: string): boolean {
    const normalized = normalizeSeparators(filePath).toLowerCase();

    if (normalized.endsWith('.d.ts')) {
      return false;
    }

    return TYPESCRIPT_EXTENSIONS.some((extension) => normalized.endsWith(extension));
  }

  extract(filePath: string, content: string, workspaceRoot: string): ExtractedFile {
    return extractWithTypeScriptAst(filePath, content, workspaceRoot, {
      language: this.language,
      scriptKind: ts.ScriptKind.TSX,
    });
  }
}

export function extractWithTypeScriptAst(
  filePath: string,
  content: string,
  workspaceRoot: string,
  options: AstExtractionOptions,
): ExtractedFile {
  const nodeId = toWorkspaceRelative(filePath, workspaceRoot);
  const emptyResult: ExtractedFile = {
    nodeId,
    language: options.language,
    symbols: [],
    edges: [],
  };

  try {
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      options.scriptKind,
    );

    const parseDiagnostics = getParseDiagnostics(sourceFile);
    if (parseDiagnostics.length > 0) {
      const firstDiagnostic = parseDiagnostics[0];
      const message = firstDiagnostic
        ? ts.flattenDiagnosticMessageText(firstDiagnostic.messageText, ' ')
        : 'unknown parse error';
      console.warn(`Unable to parse ${nodeId}: ${message}`);
      return emptyResult;
    }

    const edges = extractEdges(sourceFile, filePath, workspaceRoot);

    return {
      nodeId,
      language: options.language,
      symbols: extractTopLevelSymbols(sourceFile),
      edges,
    };
  } catch (error) {
    console.warn(`Unable to extract imports from ${nodeId}:`, error);
    return emptyResult;
  }
}

function extractEdges(
  sourceFile: ts.SourceFile,
  filePath: string,
  workspaceRoot: string,
): ExtractedEdge[] {
  const edges: ExtractedEdge[] = [];
  const seen = new Set<string>();

  const addEdge = (to: string, kind: EdgeKind, edgeKind?: string): void => {
    const edge: ExtractedEdge = {
      to,
      kind,
      confidence: 'EXTRACTED' satisfies EdgeConfidence,
    };

    if (edgeKind !== undefined) {
      edge.edgeKind = edgeKind;
    }

    const key = `${edge.kind}\u0000${edge.edgeKind ?? ''}\u0000${edge.to}`;
    if (!seen.has(key)) {
      seen.add(key);
      edges.push(edge);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      extractModuleSpecifier(node.moduleSpecifier, filePath, workspaceRoot, (to) => {
        const importClause = node.importClause;

        if (!importClause) {
          addEdge(to, 'IMPORTS');
          return;
        }

        if (importClause.name) {
          addEdge(to, 'IMPORTS', 'default');
        }

        const namedBindings = importClause.namedBindings;
        if (namedBindings) {
          addEdge(to, 'IMPORTS', ts.isNamespaceImport(namedBindings) ? 'namespace' : 'named');
        }
      });
    } else if (ts.isImportEqualsDeclaration(node)) {
      extractImportEqualsTarget(node, filePath, workspaceRoot, (to) =>
        addEdge(to, 'IMPORTS', 'named'),
      );
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      extractModuleSpecifier(node.moduleSpecifier, filePath, workspaceRoot, (to) =>
        addEdge(to, 'IMPORTS', 'named'),
      );
    } else if (ts.isCallExpression(node)) {
      extractRequireTarget(node, filePath, workspaceRoot, (to) =>
        addEdge(to, 'IMPORTS', 'default'),
      );
    } else if (ts.isClassDeclaration(node)) {
      extractHeritageTargets(node, (to, edgeKind) => addEdge(to, 'INHERITS', edgeKind));
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      addEdge(node.expression.text, 'INSTANTIATES', 'direct');
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return edges;
}

function extractModuleSpecifier(
  moduleSpecifier: ts.Expression,
  filePath: string,
  workspaceRoot: string,
  addTarget: (to: string) => void,
): void {
  if (isStringLiteralExpression(moduleSpecifier)) {
    addTarget(resolveModule(moduleSpecifier.text, filePath, workspaceRoot));
  }
}

function extractImportEqualsTarget(
  node: ts.ImportEqualsDeclaration,
  filePath: string,
  workspaceRoot: string,
  addTarget: (to: string) => void,
): void {
  const moduleReference = node.moduleReference;

  if (ts.isExternalModuleReference(moduleReference)) {
    const expression = moduleReference.expression;
    if (expression && isStringLiteralExpression(expression)) {
      addTarget(resolveModule(expression.text, filePath, workspaceRoot));
    }
    return;
  }

  if (ts.isIdentifier(moduleReference) || ts.isQualifiedName(moduleReference)) {
    addTarget(moduleReference.getText());
  }
}

function extractRequireTarget(
  node: ts.CallExpression,
  filePath: string,
  workspaceRoot: string,
  addTarget: (to: string) => void,
): void {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== 'require') {
    return;
  }

  const firstArgument = node.arguments[0];
  if (firstArgument && isStringLiteralExpression(firstArgument)) {
    addTarget(resolveModule(firstArgument.text, filePath, workspaceRoot));
  }
}

function extractHeritageTargets(
  node: ts.ClassDeclaration,
  addTarget: (to: string, edgeKind: 'extends' | 'implements') => void,
): void {
  for (const clause of node.heritageClauses ?? []) {
    const edgeKind = clause.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';
    for (const heritageType of clause.types) {
      addTarget(heritageType.expression.getText(), edgeKind);
    }
  }
}

function extractTopLevelSymbols(sourceFile: ts.SourceFile): string[] {
  const symbols: string[] = [];

  for (const statement of sourceFile.statements) {
    if (
      ts.isClassDeclaration(statement) ||
      ts.isFunctionDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (statement.name) {
        symbols.push(statement.name.text);
      }
    } else if (
      ts.isVariableStatement(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of statement.declarationList.declarations) {
        collectBindingName(declaration.name, symbols);
      }
    }
  }

  return symbols;
}

function collectBindingName(bindingName: ts.BindingName, symbols: string[]): void {
  if (ts.isIdentifier(bindingName)) {
    symbols.push(bindingName.text);
    return;
  }

  for (const element of bindingName.elements) {
    if (!ts.isOmittedExpression(element)) {
      collectBindingName(element.name, symbols);
    }
  }
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }

  return Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === kind));
}

function getParseDiagnostics(sourceFile: ts.SourceFile): readonly ts.Diagnostic[] {
  const sourceWithDiagnostics = sourceFile as ts.SourceFile & {
    readonly parseDiagnostics?: readonly ts.Diagnostic[];
  };

  return sourceWithDiagnostics.parseDiagnostics ?? [];
}

function isStringLiteralExpression(
  node: ts.Node,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function resolveModule(specifier: string, filePath: string, workspaceRoot: string): string {
  if (isBareSpecifier(specifier)) {
    return specifier;
  }

  const absoluteBase =
    specifier.startsWith('/') || specifier.startsWith('\\')
      ? path.resolve(workspaceRoot, specifier.replace(/^[\\/]+/, ''))
      : path.resolve(path.dirname(filePath), specifier);
  const resolved = resolveExistingModulePath(absoluteBase) ?? absoluteBase;

  // TODO: Support tsconfig.json baseUrl/paths mappings; custom aliases may need AMBIGUOUS confidence.
  return toWorkspaceRelative(resolved, workspaceRoot);
}

function resolveExistingModulePath(absoluteBase: string): string | undefined {
  if (safeExists(absoluteBase) && safeStatIsFile(absoluteBase)) {
    return absoluteBase;
  }

  if (path.extname(absoluteBase)) {
    return safeExists(absoluteBase) ? absoluteBase : undefined;
  }

  for (const extension of RESOLUTION_EXTENSIONS) {
    const candidate = `${absoluteBase}${extension}`;
    if (safeExists(candidate) && safeStatIsFile(candidate)) {
      return candidate;
    }
  }

  if (safeExists(absoluteBase) && safeStatIsDirectory(absoluteBase)) {
    for (const indexFile of INDEX_CANDIDATES) {
      const candidate = path.join(absoluteBase, indexFile);
      if (safeExists(candidate) && safeStatIsFile(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

function safeExists(candidate: string): boolean {
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}

function safeStatIsFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function safeStatIsDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('\\');
}

function toWorkspaceRelative(filePath: string, workspaceRoot: string): string {
  const relativePath = path.relative(workspaceRoot, path.resolve(filePath));
  return normalizeSeparators(relativePath || path.basename(filePath));
}

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, '/');
}
