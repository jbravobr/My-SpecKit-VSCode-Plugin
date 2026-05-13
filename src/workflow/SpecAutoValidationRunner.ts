import type { IFileSystem } from '../generator/utils/IFileSystem';
import { extractSpecType } from '../parser/BaseParser';
import { parseStory } from '../story/StoryParser';
import { StoryHeuristicValidator } from '../validator/auto/StoryHeuristicValidator';
import type { Finding } from '../validator/auto/types';

export interface SpecAutoValidationDeps {
  fs: IFileSystem;
  workspaceRoot: string;
  specPath: string;
  /** Optional override for tests. Defaults to a new StoryHeuristicValidator instance. */
  validator?: StoryHeuristicValidator;
  /** Override now() for stable timestamps in tests. */
  now?: () => Date;
}

export interface SpecAutoValidationResult {
  ran: boolean;
  findings: Finding[];
  reportPath?: string;
  reason?: string;
}

function findingToBullet(f: Finding): string {
  const fix = f.suggestedFix ? ` Fix: ${f.suggestedFix}` : '';
  const ruleId =
    f.metadata && typeof f.metadata['ruleId'] === 'string' ? ` [\`${f.metadata['ruleId']}\`]` : '';
  return `- ⚠️ ${f.message}${ruleId}.${fix}`;
}

/**
 * Best-effort: on spec.md save, run StoryHeuristicValidator and persist a
 * low-noise evidence file at .speckit/evidence/latest-heuristic.md.
 *
 * Never throws. Returns { ran: false, reason } when the file isn't a story
 * spec or parsing fails — callers should ignore.
 *
 * This is the spec-save automatic validation hook: it gives the Revisor a
 * standing list of missing testability disciplines (idempotency, state,
 * recovery, BVA) so it can require them as acceptance criteria before
 * gate 1 transition.
 */
export async function runSpecHeuristicOnSave(
  deps: SpecAutoValidationDeps,
): Promise<SpecAutoValidationResult> {
  const { fs, workspaceRoot, specPath } = deps;
  const validator = deps.validator ?? new StoryHeuristicValidator();
  const now = deps.now ?? (() => new Date());

  let content: string;
  try {
    content = await fs.readFile(specPath);
  } catch (err) {
    return { ran: false, findings: [], reason: `read-error: ${(err as Error).message}` };
  }

  let specType: string;
  try {
    specType = extractSpecType(content);
  } catch {
    return { ran: false, findings: [], reason: 'unparseable-spec-type' };
  }
  if (specType !== 'story') {
    return { ran: false, findings: [], reason: `not-a-story:${specType}` };
  }

  let story;
  try {
    story = parseStory(content);
  } catch (err) {
    return { ran: false, findings: [], reason: `parse-error: ${(err as Error).message}` };
  }

  let findings: Finding[];
  try {
    findings = await validator.run({
      workspaceRoot,
      fs,
      story,
      storyFiles: [],
      gateTarget: 1,
    });
  } catch (err) {
    return { ran: false, findings: [], reason: `validator-error: ${(err as Error).message}` };
  }

  const sep = workspaceRoot.includes('\\') && !workspaceRoot.includes('/') ? '\\' : '/';
  const dir = `${workspaceRoot}${sep}.speckit${sep}evidence`;
  const reportPath = `${dir}${sep}latest-heuristic.md`;

  const header =
    `# Heurísticas de Spec — \`STORY-${story.metadata.id}\`\n\n` +
    `_Geradas automaticamente em ${now().toISOString()} a partir de \`${specPath}\`._\n\n`;

  const body =
    findings.length === 0
      ? '✅ Nenhuma disciplina de teste faltante detectada na narrativa atual.\n'
      : `🛑 ${findings.length} disciplina(s) ausente(s) — sugerir ao Implementador adicionar como critério de aceite:\n\n` +
        findings.map(findingToBullet).join('\n') +
        '\n';

  try {
    await fs.ensureDir(dir);
    await fs.writeFile(reportPath, header + body);
  } catch (err) {
    return {
      ran: true,
      findings,
      reason: `write-error: ${(err as Error).message}`,
    };
  }

  return { ran: true, findings, reportPath };
}
