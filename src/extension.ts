import * as vscode from 'vscode';
import { generateDevToolsSkill } from './generator/skill/DevToolsSkillGenerator';
import { DevToolsAssessment } from './generator/utils/DevToolsAssessor';
import { vscodeFileSystem } from './generator/utils/VscodeFileSystem';
import { registerSpeckitParticipant } from './participant/speckitParticipant';
import { Framework, Language } from './story/Story';

export function activate(context: vscode.ExtensionContext): void {
  registerSpeckitParticipant(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('speckit.newStory', async () => {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: '@speckit /new',
      });
    }),
    vscode.commands.registerCommand('speckit.fixStory', async () => {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: '@speckit /fix',
      });
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
