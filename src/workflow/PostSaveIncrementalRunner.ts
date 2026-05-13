import type { IFileSystem } from '../generator/utils/IFileSystem';
import type { IWorkspace } from '../generator/utils/IWorkspace';
import { extractSpecType } from '../parser/BaseParser';
import { parseStory } from '../story/StoryParser';
import { CrapValidator } from '../validator/auto/CrapValidator';
import type { Finding, Validator } from '../validator/auto/types';

const TS_JS_EXT = /\.(ts|tsx|js|jsx|mts|cts)$/i;

export interface PostSaveIncrementalDeps {
  fs: IFileSystem;
  workspace: IWorkspace;
  savedFilePath: string;
  /** Override validator for tests. Default: new CrapValidator(). */
  crapValidator?: Validator;
  /** Override now() for stable test output. */
  now?: () => Date;
  /** Minimum gate at which to recalculate (default 2). */
  minGate?: number;
}

export interface PostSaveIncrementalResult {
  ran: boolean;
  findings: Finding[];
  reportPath?: string;
  reason?: string;
}

function findingToBullet(f: Finding): string {
  const where = f.path ? ` \`${f.path}${f.line ? ':' + f.line : ''}\`` : '';
  const fix = f.suggestedFix ? ` Fix: ${f.suggestedFix}` : '';
  const sev =
    f.severity === 'error' || f.severity === 'blocker' ? '🛑' : f.severity === 'warn' ? '⚠️' : 'ℹ️';
  return `- ${sev} ${f.message}${where}.${fix}`;
}

/**
 * Incremental CRAP recalc triggered by a code-file save.
 *
 * Strategy: keep it cheap. Skip if not TS/JS, no active spec, or spec gate
 * below the threshold (default >= 2: only relevant once implementation has
 * started). Run CrapValidator with storyFiles=[savedFilePath] only — a single
 * AST pass + one coverage-summary read. Persist a single-file report at
 * .speckit/evidence/latest-crap.md so the Revisor can read fresh CRAP context
 * without waiting for the next gate transition.
 *
 * Best-effort. Never throws.
 */
export async function runIncrementalCrapForSavedFile(
  deps: PostSaveIncrementalDeps,
): Promise<PostSaveIncrementalResult> {
  const { fs, workspace, savedFilePath } = deps;
  const validator = deps.crapValidator ?? new CrapValidator();
  const now = deps.now ?? (() => new Date());
  const minGate = deps.minGate ?? 2;

  if (!TS_JS_EXT.test(savedFilePath)) {
    return { ran: false, findings: [], reason: 'not-ts-or-js' };
  }

  const workspaceRoot = workspace.getWorkspaceRoot();
  if (!workspaceRoot) return { ran: false, findings: [], reason: 'no-workspace' };

  let specPath: string | undefined;
  try {
    specPath = (await workspace.getActiveSpecPath()) ?? undefined;
  } catch {
    return { ran: false, findings: [], reason: 'workspace-error' };
  }
  if (!specPath) return { ran: false, findings: [], reason: 'no-active-spec' };

  let specContent: string;
  try {
    specContent = await fs.readFile(specPath);
  } catch {
    return { ran: false, findings: [], reason: 'spec-read-error' };
  }

  let specType: string;
  try {
    specType = extractSpecType(specContent);
  } catch {
    return { ran: false, findings: [], reason: 'spec-parse-error' };
  }
  if (specType !== 'story') {
    return { ran: false, findings: [], reason: `not-a-story:${specType}` };
  }

  let story;
  try {
    story = parseStory(specContent);
  } catch {
    return { ran: false, findings: [], reason: 'story-parse-error' };
  }

  if (story.metadata.gate < minGate) {
    return { ran: false, findings: [], reason: `gate-below-min:${story.metadata.gate}` };
  }

  let findings: Finding[];
  try {
    findings = await validator.run({
      workspaceRoot,
      fs,
      story,
      storyFiles: [savedFilePath],
      gateTarget: 3,
    });
  } catch (err) {
    return { ran: false, findings: [], reason: `validator-error: ${(err as Error).message}` };
  }

  const sep = workspaceRoot.includes('\\') && !workspaceRoot.includes('/') ? '\\' : '/';
  const dir = `${workspaceRoot}${sep}.speckit${sep}evidence`;
  const reportPath = `${dir}${sep}latest-crap.md`;

  const header =
    `# CRAP incremental — \`STORY-${story.metadata.id}\`\n\n` +
    `_Recalculado em ${now().toISOString()} após save de \`${savedFilePath}\`._\n\n`;

  const body =
    findings.length === 0
      ? '✅ Nenhuma função do arquivo excede CRAP threshold.\n'
      : `🛑 ${findings.length} achado(s) de CRAP/qualidade:\n\n` +
        findings.map(findingToBullet).join('\n') +
        '\n';

  try {
    await fs.ensureDir(dir);
    await fs.writeFile(reportPath, header + body);
  } catch (err) {
    return { ran: true, findings, reason: `write-error: ${(err as Error).message}` };
  }

  return { ran: true, findings, reportPath };
}
