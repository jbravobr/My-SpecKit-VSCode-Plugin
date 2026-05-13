import * as vscode from 'vscode';
import type { IFileSystem } from '../generator/utils/IFileSystem';
import type { IWorkspace } from '../generator/utils/IWorkspace';
import { extractSpecType } from '../parser/BaseParser';
import { parseStory } from '../story/StoryParser';
import { MetricsRecorder, type MetricEvent } from '../workflow/MetricsRecorder';

const COMMAND_OPEN_METRICS = 'speckit.openMetrics';

function lastEvent(events: MetricEvent[]): MetricEvent | undefined {
  if (events.length === 0) return undefined;
  return events[events.length - 1];
}

function statusEmoji(passed?: boolean): string {
  if (passed === true) return '$(check)';
  if (passed === false) return '$(error)';
  return '$(circle-outline)';
}

export class SpeckitStatusBar {
  private readonly item: vscode.StatusBarItem;
  private disposed = false;

  constructor(
    private readonly fs: IFileSystem,
    private readonly workspace: IWorkspace,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.command = COMMAND_OPEN_METRICS;
    this.item.text = '$(book) SpecKit';
    this.item.tooltip = 'SpecKit: clique para abrir métricas';
    this.item.show();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.item.dispose();
  }

  async refresh(): Promise<void> {
    if (this.disposed) return;
    const workspaceRoot = this.workspace.getWorkspaceRoot();
    if (!workspaceRoot) {
      this.item.text = '$(book) SpecKit';
      this.item.tooltip = 'SpecKit: nenhum workspace aberto';
      return;
    }
    let specId: string | undefined;
    let gate: number | undefined;
    try {
      const specPath = await this.workspace.getActiveSpecPath();
      if (specPath) {
        const content = await this.fs.readFile(specPath);
        if (extractSpecType(content) === 'story') {
          const story = parseStory(content);
          specId = story.metadata.id;
          gate = story.metadata.gate;
        }
      }
    } catch {
      // ignore
    }

    let recent: MetricEvent | undefined;
    try {
      const recorder = new MetricsRecorder(this.fs, workspaceRoot);
      const events = await recorder.readAll();
      recent = lastEvent(events);
    } catch {
      // ignore
    }

    const parts: string[] = [];
    parts.push(`${statusEmoji(recent?.passed)} SpecKit`);
    if (specId) parts.push(`${specId}`);
    if (typeof gate === 'number') parts.push(`Gate ${gate}`);
    if (recent && typeof recent.findingsBlocking === 'number' && recent.findingsBlocking > 0) {
      parts.push(`🛑${recent.findingsBlocking}`);
    }
    this.item.text = parts.join(' · ');

    const tipLines: string[] = ['**SpecKit**'];
    if (specId) tipLines.push(`Spec ativa: STORY-${specId}`);
    if (typeof gate === 'number') tipLines.push(`Gate atual: ${gate}`);
    if (recent) {
      tipLines.push(`Último evento: ${recent.type} (${recent.ts ?? '?'})`);
      if (typeof recent.passed === 'boolean') {
        tipLines.push(`Resultado: ${recent.passed ? 'PASSED' : 'BLOCKED'}`);
      }
      if (typeof recent.findingsBlocking === 'number') {
        tipLines.push(`Bloqueadores: ${recent.findingsBlocking}`);
      }
    }
    tipLines.push('—');
    tipLines.push('Clique para abrir /metrics no chat');
    this.item.tooltip = new vscode.MarkdownString(tipLines.join('  \n'));
  }
}

export { COMMAND_OPEN_METRICS };
