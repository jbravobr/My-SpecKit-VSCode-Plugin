import * as vscode from 'vscode';
import type { IFileSystem } from '../../generator/utils/IFileSystem';
import type { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { parseStory } from '../../story/StoryParser';
import type { Gate } from '../../story/Story';
import {
  CoverageThresholdValidator,
  CrapValidator,
  AcceptanceCriteriaTestPresenceValidator,
  StoryHeuristicValidator,
  TestExecutionValidator,
  TypecheckValidator,
} from '../../validator/auto';
import { EvidenceReportWriter } from '../../workflow/EvidenceReportWriter';
import { GateEvidenceCollector } from '../../workflow/GateEvidenceCollector';
import { gitOps } from '../../workflow/GitOperations';
import { buildRevisorPrompt } from '../../workflow/RevisorFeedbackBridge';
import { handleCommandError, requireWorkspace } from './CommandHelpers';

function parseGateArg(prompt: string): Gate | undefined {
  const m = /--gate\s+(\d)/i.exec(prompt);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (Number.isInteger(n) && n >= 0 && n <= 4) return n as Gate;
  return undefined;
}

export interface VerifyDeps {
  collector?: GateEvidenceCollector;
  writer?: (root: string, fs: IFileSystem) => EvidenceReportWriter;
}

export function buildDefaultCollector(): GateEvidenceCollector {
  const c = new GateEvidenceCollector();
  c.registerValidator(new StoryHeuristicValidator());
  c.registerValidator(new TypecheckValidator());
  c.registerValidator(new AcceptanceCriteriaTestPresenceValidator());
  c.registerValidator(new TestExecutionValidator());
  c.registerValidator(new CoverageThresholdValidator());
  c.registerValidator(new CrapValidator());
  return c;
}

export async function handleVerifyCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
  deps: VerifyDeps = {},
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const specPath = await workspace.getActiveSpecPath();
  if (!specPath) {
    stream.markdown(
      '❌ Nenhuma spec ativa em `.speckit/`. Use `/new` para criar uma antes de `/verify`.',
    );
    return;
  }

  let content: string;
  try {
    content = await fs.readFile(specPath);
  } catch (err: unknown) {
    handleCommandError(err, stream, `Erro ao ler a spec (\`${specPath}\`)`);
    return;
  }

  const story = parseStory(content);
  const currentGate = story.metadata.gate;
  const explicitGate = parseGateArg(request.prompt ?? '');
  const target: Gate = explicitGate ?? (currentGate >= 4 ? 4 : ((currentGate + 1) as Gate));

  let storyFiles: string[] = [];
  try {
    if (gitOps.changedFiles) {
      storyFiles = await gitOps.changedFiles(workspaceRoot);
    }
  } catch {
    storyFiles = [];
  }

  const collector = deps.collector ?? buildDefaultCollector();
  const abort = new AbortController();
  if (token.isCancellationRequested) {
    abort.abort();
  } else {
    token.onCancellationRequested(() => abort.abort());
  }

  stream.markdown(
    `🧪 Executando validação determinística para Gate ${target} (spec \`${story.metadata.id}\`)…\n\n` +
      `Validadores: \`${collector.validatorsForGate(target).join(', ') || '(nenhum)'}\`\n` +
      `Arquivos no escopo: ${storyFiles.length === 0 ? '_(usando diff vs develop falhou ou vazio)_' : storyFiles.map((f) => `\`${f}\``).join(', ')}\n\n`,
  );

  const report = await collector.collect({
    workspaceRoot,
    fs,
    story,
    storyFiles,
    gateTarget: target,
    signal: abort.signal,
  });

  const writerFactory = deps.writer ?? ((root, f) => new EvidenceReportWriter(f, root));
  const writer = writerFactory(workspaceRoot, fs);
  const written = await writer.write(report, story.metadata.id);

  const prompt = buildRevisorPrompt(report);
  stream.markdown(
    `${report.passed ? '✅' : '🛑'} **${prompt.summary}**\n\n` +
      `${prompt.body}\n\n` +
      `---\n` +
      `Evidência persistida em:\n` +
      `- 📄 \`${written.reportPath.replace(workspaceRoot.replace(/\\/g, '/'), '.').replace(/^\.\//, '')}\`\n` +
      `- 🧾 \`${written.jsonPath.replace(workspaceRoot.replace(/\\/g, '/'), '.').replace(/^\.\//, '')}\`\n` +
      `- 🔖 \`${written.latestPath.replace(workspaceRoot.replace(/\\/g, '/'), '.').replace(/^\.\//, '')}\` (atualizado)\n\n` +
      `O **Revisor** deve consumir \`.speckit/evidence/latest.md\` no próximo turno e coordenar correções com o Implementador até findings = 0.\n`,
  );
}
