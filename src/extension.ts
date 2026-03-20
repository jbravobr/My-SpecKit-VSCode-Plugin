import * as vscode from 'vscode';
import { registerSpeckitParticipant } from './participant/speckitParticipant';

export function activate(context: vscode.ExtensionContext): void {
  registerSpeckitParticipant(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('speckit.newStory', async () => {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: '@speckit /new',
      });
    }),
    vscode.commands.registerCommand('speckit.applyStory', async () => {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: '@speckit /apply',
      });
    }),
  );
}

export function deactivate(): void {}
