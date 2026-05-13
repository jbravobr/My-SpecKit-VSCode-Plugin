import * as path from 'path';
import type { Finding, Validator, ValidatorContext } from './types';

export interface CoverageMetric {
  total: number;
  covered: number;
  skipped: number;
  pct: number;
}

export interface CoverageFileEntry {
  lines: CoverageMetric;
  statements: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
}

export interface CoverageSummary {
  total?: CoverageFileEntry;
  [filePath: string]: CoverageFileEntry | undefined;
}

export interface CoverageThresholds {
  lines: number;
  statements: number;
  functions: number;
  branches: number;
}

export const DEFAULT_THRESHOLDS: CoverageThresholds = {
  lines: 80,
  statements: 80,
  functions: 80,
  branches: 75,
};

const COVERAGE_SUMMARY_REL_PATH = path.join('coverage', 'coverage-summary.json');

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function matchesStoryFile(coveragePath: string, storyFile: string): boolean {
  const a = normalizePath(coveragePath);
  const b = normalizePath(storyFile);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

export class CoverageThresholdValidator implements Validator {
  readonly id = 'coverage-threshold';
  readonly description =
    'Lê coverage/coverage-summary.json (istanbul) e bloqueia quando arquivos da story estão abaixo do threshold por métrica.';

  constructor(
    private readonly thresholds: CoverageThresholds = DEFAULT_THRESHOLDS,
    private readonly summaryRelPath: string = COVERAGE_SUMMARY_REL_PATH,
  ) {}

  async run(ctx: ValidatorContext): Promise<Finding[]> {
    const summaryPath = path.join(ctx.workspaceRoot, this.summaryRelPath);
    if (!(await ctx.fs.fileExists(summaryPath))) {
      return [
        {
          validator: this.id,
          severity: 'warn',
          message: `Coverage summary não encontrado em ${this.summaryRelPath}. Rode a suíte com cobertura antes do gate.`,
          delegatedToRevisor: {
            reason: 'coverage-summary ausente — executar suíte com cobertura habilitada',
            command: 'npm run test:unit:coverage',
          },
        },
      ];
    }

    let summary: CoverageSummary;
    try {
      const raw = await ctx.fs.readFile(summaryPath);
      summary = JSON.parse(raw) as CoverageSummary;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return [
        {
          validator: this.id,
          severity: 'error',
          message: `Falha ao ler/parsear ${this.summaryRelPath}: ${msg}`,
        },
      ];
    }

    const storyFiles = ctx.storyFiles ?? [];
    if (storyFiles.length === 0) {
      return [];
    }

    const findings: Finding[] = [];
    for (const storyFile of storyFiles) {
      const entry = this.findEntry(summary, storyFile);
      if (!entry) {
        findings.push({
          validator: this.id,
          severity: 'warn',
          message: `Sem dados de cobertura para ${storyFile}. Garanta que o arquivo é coberto por algum teste executado.`,
          path: storyFile,
        });
        continue;
      }
      findings.push(...this.evaluateEntry(storyFile, entry));
    }
    return findings;
  }

  private findEntry(summary: CoverageSummary, storyFile: string): CoverageFileEntry | undefined {
    for (const [key, value] of Object.entries(summary)) {
      if (key === 'total' || !value) continue;
      if (matchesStoryFile(key, storyFile)) return value;
    }
    return undefined;
  }

  private evaluateEntry(storyFile: string, entry: CoverageFileEntry): Finding[] {
    const findings: Finding[] = [];
    const metrics: (keyof CoverageThresholds)[] = ['lines', 'statements', 'functions', 'branches'];
    for (const metric of metrics) {
      const min = this.thresholds[metric];
      const actual = entry[metric]?.pct;
      if (typeof actual !== 'number') continue;
      if (actual < min) {
        findings.push({
          validator: this.id,
          severity: 'error',
          message: `${storyFile}: cobertura de ${metric} ${actual.toFixed(1)}% < threshold ${min}%`,
          path: storyFile,
          suggestedFix: `Adicionar testes que cubram ${metric} faltantes em ${storyFile} para atingir ≥ ${min}%`,
          metadata: { metric, actual, threshold: min },
        });
      }
    }
    return findings;
  }
}
