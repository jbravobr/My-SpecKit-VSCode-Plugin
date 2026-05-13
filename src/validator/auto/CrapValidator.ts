import * as path from 'path';
import * as ts from 'typescript';
import type { Finding, Validator, ValidatorContext } from './types';
import type { CoverageSummary, CoverageFileEntry } from './CoverageThresholdValidator';

export interface FunctionComplexity {
  name: string;
  line: number;
  cc: number;
}

export interface CrapResult {
  function: FunctionComplexity;
  coveragePct: number;
  crap: number;
}

const TS_JS_EXT = /\.(ts|tsx|js|jsx|mts|cts)$/i;
const COVERAGE_SUMMARY_REL_PATH = path.join('coverage', 'coverage-summary.json');

const STACK_COMMANDS: Record<string, string> = {
  java: 'mvn verify -pl <module> # gerar JaCoCo + PMD/Sonar para CRAP',
  kotlin: 'gradle test koverHtmlReport detekt',
  python: 'pytest --cov=<package> && radon cc <package>',
  csharp: 'dotnet test --collect:"XPlat Code Coverage" && SonarScanner',
  go: 'go test ./... -coverprofile=cover.out && gocyclo .',
};

export function computeCrap(cc: number, coveragePct: number): number {
  const safePct = Math.max(0, Math.min(100, coveragePct));
  const uncovered = 1 - safePct / 100;
  return cc * cc * Math.pow(uncovered, 3) + cc;
}

function functionName(node: ts.Node): string {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.getText();
  if (ts.isMethodDeclaration(node) && node.name) return node.name.getText();
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (ts.isGetAccessorDeclaration(node) && node.name) return `get ${node.name.getText()}`;
  if (ts.isSetAccessorDeclaration(node) && node.name) return `set ${node.name.getText()}`;
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    node.parent &&
    ts.isVariableDeclaration(node.parent) &&
    node.parent.name
  ) {
    return node.parent.name.getText();
  }
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    node.parent &&
    ts.isPropertyAssignment(node.parent)
  ) {
    return node.parent.name.getText();
  }
  return '<anonymous>';
}

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function countDecisionsInBody(body: ts.Node): number {
  let count = 0;
  function walk(node: ts.Node): void {
    if (isFunctionLike(node)) {
      // Skip nested functions; they get their own CC calculation
      return;
    }
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
        count++;
        break;
      case ts.SyntaxKind.CaseClause:
        count++;
        break;
      case ts.SyntaxKind.BinaryExpression: {
        const op = (node as ts.BinaryExpression).operatorToken.kind;
        if (
          op === ts.SyntaxKind.AmpersandAmpersandToken ||
          op === ts.SyntaxKind.BarBarToken ||
          op === ts.SyntaxKind.QuestionQuestionToken
        ) {
          count++;
        }
        break;
      }
      default:
        break;
    }
    ts.forEachChild(node, walk);
  }
  walk(body);
  return count;
}

export function extractFunctionsWithCC(source: string, fileName = 'file.ts'): FunctionComplexity[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const result: FunctionComplexity[] = [];

  function visit(node: ts.Node): void {
    if (isFunctionLike(node)) {
      const fn = node as ts.FunctionLikeDeclaration;
      const body = fn.body;
      if (body) {
        const decisions = countDecisionsInBody(body);
        const cc = 1 + decisions;
        const { line } = sf.getLineAndCharacterOfPosition(fn.getStart(sf));
        result.push({
          name: functionName(node),
          line: line + 1,
          cc,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return result;
}

function matchSummaryEntry(
  summary: CoverageSummary,
  storyFile: string,
): CoverageFileEntry | undefined {
  const norm = (p: string) => p.replace(/\\/g, '/');
  const target = norm(storyFile);
  for (const [key, value] of Object.entries(summary)) {
    if (key === 'total' || !value) continue;
    const nk = norm(key);
    if (nk === target || nk.endsWith(`/${target}`) || target.endsWith(`/${nk}`)) {
      return value;
    }
  }
  return undefined;
}

export interface CrapValidatorOptions {
  threshold?: number;
  minCcToEvaluate?: number;
  summaryRelPath?: string;
}

export class CrapValidator implements Validator {
  readonly id = 'crap-score';
  readonly description =
    'Calcula CRAP por função em arquivos TS/JS modificados pela story usando AST do TypeScript + cobertura de arquivo (coverage-summary.json). Bloqueia funções com CRAP > threshold.';

  private readonly threshold: number;
  private readonly minCcToEvaluate: number;
  private readonly summaryRelPath: string;

  constructor(opts: CrapValidatorOptions = {}) {
    this.threshold = opts.threshold ?? 30;
    this.minCcToEvaluate = opts.minCcToEvaluate ?? 5;
    this.summaryRelPath = opts.summaryRelPath ?? COVERAGE_SUMMARY_REL_PATH;
  }

  async run(ctx: ValidatorContext): Promise<Finding[]> {
    const storyFiles = ctx.storyFiles ?? [];
    if (storyFiles.length === 0) return [];

    const tsJsFiles = storyFiles.filter((f) => TS_JS_EXT.test(f));
    const otherFiles = storyFiles.filter(
      (f) => !TS_JS_EXT.test(f) && /\.(java|kt|py|cs|go)$/i.test(f),
    );

    const findings: Finding[] = [];

    if (otherFiles.length > 0) {
      findings.push(...this.delegateNonTsFiles(otherFiles, ctx.story?.technicalSpec?.language));
    }

    if (tsJsFiles.length === 0) return findings;

    const summary = await this.loadSummary(ctx);
    if (!summary) {
      findings.push({
        validator: this.id,
        severity: 'warn',
        message:
          'Coverage summary não encontrado — CRAP calculado com cobertura assumida 0% (worst case).',
        delegatedToRevisor: {
          reason: 'rodar suíte com cobertura habilitada antes da próxima verificação',
          command: 'npm run test:unit:coverage',
        },
      });
    }

    for (const file of tsJsFiles) {
      findings.push(...(await this.analyzeFile(file, summary, ctx)));
    }
    return findings;
  }

  private async loadSummary(ctx: ValidatorContext): Promise<CoverageSummary | undefined> {
    const file = path.join(ctx.workspaceRoot, this.summaryRelPath);
    if (!(await ctx.fs.fileExists(file))) return undefined;
    try {
      return JSON.parse(await ctx.fs.readFile(file)) as CoverageSummary;
    } catch {
      return undefined;
    }
  }

  private async analyzeFile(
    file: string,
    summary: CoverageSummary | undefined,
    ctx: ValidatorContext,
  ): Promise<Finding[]> {
    const absPath = path.isAbsolute(file) ? file : path.join(ctx.workspaceRoot, file);
    let content: string;
    try {
      content = await ctx.fs.readFile(absPath);
    } catch (err) {
      return [
        {
          validator: this.id,
          severity: 'warn',
          message: `Não foi possível ler ${file}: ${err instanceof Error ? err.message : String(err)}`,
          path: file,
        },
      ];
    }

    const functions = extractFunctionsWithCC(content, file);
    const entry = summary ? matchSummaryEntry(summary, file) : undefined;
    const coveragePct = entry?.lines?.pct ?? 0;

    const findings: Finding[] = [];
    for (const fn of functions) {
      if (fn.cc < this.minCcToEvaluate) continue;
      const crap = computeCrap(fn.cc, coveragePct);
      if (crap > this.threshold) {
        findings.push({
          validator: this.id,
          severity: ctx.gateTarget === 2 || ctx.gateTarget === 3 ? 'error' : 'warn',
          message: `${file}:${fn.line} ${fn.name} — CRAP ${crap.toFixed(1)} (CC=${fn.cc}, cov=${coveragePct.toFixed(1)}%) > threshold ${this.threshold}`,
          path: file,
          line: fn.line,
          suggestedFix: `Caminho A: adicionar testes comportamentais cobrindo ${fn.name} até CRAP ≤ ${this.threshold}. Caminho B: decompor ${fn.name} (CC=${fn.cc}) em funções menores.`,
          metadata: {
            function: fn.name,
            cc: fn.cc,
            coveragePct,
            crap,
            threshold: this.threshold,
          },
        });
      }
    }
    return findings;
  }

  private delegateNonTsFiles(files: string[], language?: string): Finding[] {
    const findings: Finding[] = [];
    const byExt = new Map<string, string[]>();
    for (const f of files) {
      const ext = (f.match(/\.([a-z]+)$/i)?.[1] ?? '').toLowerCase();
      const key = ext === 'kt' ? 'kotlin' : ext === 'cs' ? 'csharp' : ext === 'py' ? 'python' : ext;
      if (!byExt.has(key)) byExt.set(key, []);
      byExt.get(key)!.push(f);
    }

    for (const [stack, paths] of byExt.entries()) {
      const command = STACK_COMMANDS[stack];
      if (!command) continue;
      findings.push({
        validator: this.id,
        severity: 'warn',
        message: `CRAP nativo não disponível para stack '${stack}' (${paths.length} arquivo(s) da story).`,
        delegatedToRevisor: {
          reason: `Calcular CRAP via ferramenta nativa da stack '${stack}' e reportar funções com CRAP > 30`,
          command,
          stack: language ?? stack,
        },
        metadata: { stack, files: paths },
      });
    }
    return findings;
  }
}
