import * as vscode from 'vscode';
import { generateDevToolsSkill } from './generator/skill/DevToolsSkillGenerator';
import { DevToolsAssessment } from './generator/utils/DevToolsAssessor';
import { vscodeFileSystem } from './generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from './generator/utils/VscodeWorkspace';
import { registerSpeckitParticipant } from './participant/speckitParticipant';
import { Framework, Language } from './story/Story';
import { createSpecFileWatcher } from './workflow/SpecFileWatcher';
import { gitOps } from './workflow/GitOperations';
import { checkPostSavePendingCommit } from './workflow/PostSaveCommitNotifier';

const POST_SAVE_DEBOUNCE_MS = 2000;

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

  await openCopilotChatWithQuery(query.trim());
}

export function activate(context: vscode.ExtensionContext): void {
  registerSpeckitParticipant(context);
  createSpecFileWatcher(context);

  // ---------------------------------------------------------------------------
  // Post-save commit nudge — fires after the user clicks Keep on Copilot Edits
  // ---------------------------------------------------------------------------
  let postSaveTimer: ReturnType<typeof setTimeout> | undefined;

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
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
    vscode.commands.registerCommand('speckit.openChatWithQuery', async (query: string) => {
      await runChatQuickAction(query);
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
