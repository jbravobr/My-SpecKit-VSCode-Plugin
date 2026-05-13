import * as path from 'path';
import type { Finding, Validator, ValidatorContext } from './types';

const TEST_FILE_PATTERN =
  /(\.test\.[tj]sx?$)|(\.spec\.[tj]sx?$)|(Test\.java$)|(Tests?\.cs$)|(^test_.*\.py$)|(_test\.go$)|(\.test\.py$)/i;

const STOPWORDS = new Set<string>([
  'deve',
  'devem',
  'sera',
  'será',
  'sendo',
  'ser',
  'tem',
  'ter',
  'esta',
  'está',
  'estao',
  'estão',
  'cada',
  'todos',
  'todas',
  'algum',
  'alguma',
  'sobre',
  'entre',
  'antes',
  'apos',
  'após',
  'quando',
  'onde',
  'como',
  'porque',
  'enquanto',
  'durante',
  'novo',
  'nova',
  'novos',
  'mesma',
  'mesmo',
  'mesmas',
  'mesmos',
  'sempre',
  'nunca',
  'apenas',
  'somente',
  'tambem',
  'também',
  'shall',
  'should',
  'would',
  'could',
  'their',
  'these',
  'those',
  'which',
  'while',
  'because',
  'about',
  'after',
  'before',
  'during',
  'every',
  'always',
  'never',
  'only',
  'also',
  'with',
  'from',
  'into',
  'than',
  'then',
]);

export function extractSignificantTokens(text: string): string[] {
  const tokens = new Set<string>();
  const lower = text.toLowerCase();
  for (const raw of lower.split(/[^\p{L}\p{N}_]+/u)) {
    if (raw.length <= 4) continue;
    if (STOPWORDS.has(raw)) continue;
    tokens.add(raw);
  }
  return [...tokens];
}

function isTestFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return TEST_FILE_PATTERN.test(base);
}

export class AcceptanceCriteriaTestPresenceValidator implements Validator {
  readonly id = 'acceptance-test-presence';
  readonly description =
    'Para cada critério de aceite, verifica se há ao menos um arquivo de teste (modificado na story) cujo conteúdo referencia termos significativos do critério.';

  async run(ctx: ValidatorContext): Promise<Finding[]> {
    if (!ctx.story) return [];
    const criteria = ctx.story.functionalSpec.acceptanceCriteria.filter((c) => c.trim().length > 0);
    if (criteria.length === 0) return [];

    const storyFiles = ctx.storyFiles ?? [];
    const testFiles = storyFiles.filter(isTestFile);

    if (testFiles.length === 0) {
      return criteria.map<Finding>((criterion, idx) => ({
        validator: this.id,
        severity: ctx.gateTarget === 2 ? 'error' : 'warn',
        message: `Critério #${idx + 1} sem teste rastreável (nenhum arquivo de teste modificado para esta story): "${truncate(criterion)}"`,
        suggestedFix: `Adicionar arquivo de teste cobrindo: ${criterion}`,
        metadata: { criterionIndex: idx, criterion },
      }));
    }

    const fileTokens = new Map<string, Set<string>>();
    for (const tf of testFiles) {
      try {
        const content = await ctx.fs.readFile(
          path.isAbsolute(tf) ? tf : path.join(ctx.workspaceRoot, tf),
        );
        fileTokens.set(tf, new Set(extractSignificantTokens(content)));
      } catch {
        // ignore unreadable test file
      }
    }

    const findings: Finding[] = [];
    criteria.forEach((criterion, idx) => {
      const required = extractSignificantTokens(criterion);
      if (required.length === 0) return;
      const matched = [...fileTokens.entries()].some(([, tokens]) =>
        required.some((r) => tokens.has(r)),
      );
      if (!matched) {
        findings.push({
          validator: this.id,
          severity: ctx.gateTarget === 2 ? 'error' : 'warn',
          message: `Critério #${idx + 1} sem teste rastreável: "${truncate(criterion)}"`,
          suggestedFix: `Adicionar teste que valide: ${criterion}`,
          metadata: { criterionIndex: idx, criterion, requiredTokens: required },
        });
      }
    });

    return findings;
  }
}

function truncate(s: string): string {
  return s.length > 120 ? s.slice(0, 117) + '...' : s;
}
