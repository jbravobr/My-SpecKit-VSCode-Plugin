import * as vscode from 'vscode';
import { generateDevToolsSkill } from './generator/skill/DevToolsSkillGenerator';
import { DevToolsAssessment } from './generator/utils/DevToolsAssessor';
import { vscodeFileSystem } from './generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from './generator/utils/VscodeWorkspace';
import { registerSpeckitParticipant } from './participant/speckitParticipant';
import { Framework, Language } from './story/Story';
import { COMMAND_OPEN_METRICS, SpeckitStatusBar } from './ui/SpeckitStatusBar';
import { SpeckitDiagnostics } from './ui/SpeckitDiagnostics';
import { createSpecFileWatcher } from './workflow/SpecFileWatcher';
import { gitOps } from './workflow/GitOperations';
import { checkPostSavePendingCommit } from './workflow/PostSaveCommitNotifier';
import { runIncrementalCrapForSavedFile } from './workflow/PostSaveIncrementalRunner';

const POST_SAVE_DEBOUNCE_MS = 2000;
const QUICK_ACTION_QUERY_RE = /^@speckit\s+\/([a-z0-9-]+)(?:\s+(.+))?$/i;
const QUICK_ACTION_ALLOWED_COMMANDS = new Set<string>([
  'new',
  'fix',
  'validate',
  'status',
  'status-all',
  'status-fix',
  'draft',
  'agent',
  'gate',
  'audit',
  'trace',
  'history',
  'diff',
  'commit',
  'context',
  'doctor',
  'batch',
  'batch-generate',
  'batch-unified',
  'help',
  'help-status',
  'review-auto',
  'init',
  'verify',
  'metrics',
  'score',
]);

interface ParsedQuickAction {
  command: string;
  args: string;
  canonicalQuery: string;
}

function parseQuickActionQuery(query: string): ParsedQuickAction | undefined {
  const match = QUICK_ACTION_QUERY_RE.exec(query.trim());
  if (!match) return undefined;

  const command = (match[1] ?? '').toLowerCase();
  const args = (match[2] ?? '').trim();
  if (!QUICK_ACTION_ALLOWED_COMMANDS.has(command)) return undefined;
  if (/[`\r\n]/.test(args)) return undefined;

  return {
    command,
    args,
    canonicalQuery: `@speckit /${command}${args ? ` ${args}` : ''}`,
  };
}

function isHighRiskQuickAction(input: ParsedQuickAction): boolean {
  const argsLower = input.args.toLowerCase();
  if (input.command === 'commit' || input.command === 'init') return true;

  if (input.command === 'review-auto') {
    return /--(?:auto|approved|changes-requested|batch-consent|confirm)\b/.test(argsLower);
  }

  if (input.command === 'batch' || input.command === 'batch-generate' || input.command === 'batch-unified') {
    return /--(?:generate|gen|unified|branch-strategy|confirm)\b/.test(argsLower) || input.command !== 'batch';
  }

  if (input.command === 'context') {
    return /^(add|remove|clear)\b/.test(argsLower);
  }

  return false;
}

async function openCopilotChatWithQuery(query: string): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.chat.open', { query });
}

async function runChatQuickAction(query: string): Promise<void> {
  if (typeof query !== 'string' || query.trim().length === 0) {
    vscode.window.showErrorMessage(
      'SpecKit: Não foi possível executar a ação rápida (query inválida).',
    );
    return;
  }

  const parsed = parseQuickActionQuery(query);
  if (!parsed) {
    vscode.window.showErrorMessage(
      'SpecKit: Ação rápida bloqueada por política de segurança (comando não permitido).',
    );
    return;
  }

  if (isHighRiskQuickAction(parsed)) {
    const confirmation = await vscode.window.showWarningMessage(
      `SpecKit: confirmar execução de ação sensível (${parsed.command}).`,
      { modal: true },
      'Executar',
    );
    if (confirmation !== 'Executar') return;
  }

  await openCopilotChatWithQuery(parsed.canonicalQuery);
}

export function activate(context: vscode.ExtensionContext): void {
  registerSpeckitParticipant(context);
  createSpecFileWatcher(context);

  // ---------------------------------------------------------------------------
  // SpecKit Diagnostics + Status Bar (best-effort UI surfaces)
  // ---------------------------------------------------------------------------
  const workspaceRoot = vscodeWorkspace.getWorkspaceRoot();
  let diagnostics: SpeckitDiagnostics | undefined;
  if (workspaceRoot) {
    diagnostics = new SpeckitDiagnostics(vscodeFileSystem, workspaceRoot);
    context.subscriptions.push({ dispose: () => diagnostics?.dispose() });
    void diagnostics.refresh();
  }
  const statusBar = new SpeckitStatusBar(vscodeFileSystem, vscodeWorkspace);
  context.subscriptions.push({ dispose: () => statusBar.dispose() });
  void statusBar.refresh();

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_OPEN_METRICS, async () => {
      await openCopilotChatWithQuery('@speckit /metrics');
    }),
  );

  // ---------------------------------------------------------------------------
  // Post-save commit nudge — fires after the user clicks Keep on Copilot Edits
  // ---------------------------------------------------------------------------
  let postSaveTimer: ReturnType<typeof setTimeout> | undefined;

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      // Incremental CRAP recalc for code saves (best-effort, never blocks).
      void (async () => {
        try {
          await runIncrementalCrapForSavedFile({
            fs: vscodeFileSystem,
            workspace: vscodeWorkspace,
            savedFilePath: doc.uri.fsPath,
          });
        } catch {
          // swallow — informational only
        }
        void diagnostics?.refresh();
        void statusBar.refresh();
      })();

      if (postSaveTimer) clearTimeout(postSaveTimer);
      postSaveTimer = setTimeout(() => {
        void checkPostSavePendingCommit({
          workspace: vscodeWorkspace,
          fs: vscodeFileSystem,
          git: gitOps,
          notify: async (specId) => {
            const action = await vscode.window.showInformationMessage(
              `SpecKit: STORY-${specId} em Gate 4 (ready-to-commit) — há mudanças pendentes após Keep.`,
              'Commitar agora',
              'Mais tarde',
            );
            if (action === 'Commitar agora') {
              await openCopilotChatWithQuery('@speckit /commit');
              return true;
            }
            return false;
          },
        });
      }, POST_SAVE_DEBOUNCE_MS);
    }),
  );

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('speckit.newStory', async () => {
      await openCopilotChatWithQuery('@speckit /new');
    }),
    vscode.commands.registerCommand('speckit.newFix', async () => {
      await openCopilotChatWithQuery('@speckit /fix');
    }),
    vscode.commands.registerCommand('speckit.fixStory', async () => {
      await openCopilotChatWithQuery('@speckit /fix');
    }),
    vscode.commands.registerCommand('speckit.runChatQuickAction', async (query: string) => {
      await runChatQuickAction(query);
    }),
    vscode.commands.registerCommand(
      'speckit.addDevToolsSkill',
      async (
        workspaceRoot: string,
        language: Language,
        framework: Framework,
        assessment: DevToolsAssessment,
      ) => {
        try {
          const fs = vscodeFileSystem;
          const skillDir = workspaceRoot + '/.github/skills/speckit-devtools';
          await fs.ensureDir(skillDir);
          await fs.writeFile(
            skillDir + '/SKILL.md',
            generateDevToolsSkill({ language, framework, assessment }),
          );
          vscode.window.showInformationMessage(
            'SpecKit: Skill de DevTools gerado em .github/skills/speckit-devtools/SKILL.md',
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`SpecKit: Erro ao gerar skill de DevTools — ${msg}`);
        }
      },
    ),
  );
}

export function deactivate(): void {}
