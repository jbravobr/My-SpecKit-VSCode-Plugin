import * as vscode from 'vscode';
import { generateDevToolsSkill } from './generator/skill/DevToolsSkillGenerator';
import { DevToolsAssessment } from './generator/utils/DevToolsAssessor';
import { vscodeFileSystem } from './generator/utils/VscodeFileSystem';
import { registerSpeckitParticipant } from './participant/speckitParticipant';
import { Framework, Language } from './story/Story';
import { createSpecFileWatcher } from './workflow/SpecFileWatcher';

async function openCopilotChatWithQuery(query: string): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.chat.open', { query });
}

export function activate(context: vscode.ExtensionContext): void {
  registerSpeckitParticipant(context);
  createSpecFileWatcher(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('speckit.newStory', async () => {
      await openCopilotChatWithQuery('@speckit /new');
    }),
    vscode.commands.registerCommand('speckit.fixStory', async () => {
      await openCopilotChatWithQuery('@speckit /fix');
    }),
    vscode.commands.registerCommand('speckit.openChatWithQuery', async (query: string) => {
      if (typeof query !== 'string' || query.trim().length === 0) {
        vscode.window.showErrorMessage(
          'SpecKit: Não foi possível executar a ação rápida (query inválida).',
        );
        return;
      }

      await openCopilotChatWithQuery(query.trim());
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
