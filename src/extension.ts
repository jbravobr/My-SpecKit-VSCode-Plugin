import * as path from 'node:path';
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
import {
  GraphQuery,
  HeadFileWatcher,
  PostSaveCoordinator,
  UserSpaceGuardrailInstaller,
} from './graph';
import { createGraphRuntime } from './graph/GraphRuntime';
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

  if (
    input.command === 'batch' ||
    input.command === 'batch-generate' ||
    input.command === 'batch-unified'
  ) {
    return (
      /--(?:generate|gen|unified|branch-strategy|confirm)\b/.test(argsLower) ||
      input.command !== 'batch'
    );
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

function getWorkspaceRootForGraphCommand(): string | undefined {
  const workspaceRoot = vscodeWorkspace.getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showInformationMessage('SpecKit: nenhum workspace aberto.');
    return undefined;
  }
  return workspaceRoot;
}

function graphUnavailableMessage(): string {
  return 'Grafo ainda não construído. Execute speckit.graph.rebuild ou /init.';
}

function normalizeGraphNodePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function renderGraphInspectionMarkdown(
  nodeId: string,
  result: ReturnType<GraphQuery['neighbors']>,
): string {
  const nodeLines = result.nodes.map((node) => `- \`${node.id}\` (${node.language})`).join('\n');
  const edgeLines = result.edges
    .map((edge) => `- \`${edge.from}\` --${edge.kind}--> \`${edge.to}\``)
    .join('\n');

  return [
    `# SpecKit Graph Inspect: ${nodeId}`,
    '',
    `## Nós (${result.nodes.length})`,
    nodeLines || '_Nenhum nó vizinho encontrado._',
    '',
    `## Arestas (${result.edges.length})`,
    edgeLines || '_Nenhuma aresta vizinha encontrada._',
    '',
  ].join('\n');
}

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscodeWorkspace.getWorkspaceRoot();
  const graphRuntime = createGraphRuntime(workspaceRoot);
  context.subscriptions.push(graphRuntime);

  registerSpeckitParticipant(context, graphRuntime);
  createSpecFileWatcher(context);

  // ---------------------------------------------------------------------------
  // SpecKit Diagnostics + Status Bar (best-effort UI surfaces)
  // ---------------------------------------------------------------------------
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
    vscode.commands.registerCommand('speckit.graph.rebuild', async () => {
      const currentWorkspaceRoot = getWorkspaceRootForGraphCommand();
      if (!currentWorkspaceRoot) return;

      const startedAt = Date.now();
      const graph = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Reconstruindo grafo SpecKit...',
        },
        async () => graphRuntime.updater.buildFull(currentWorkspaceRoot),
      );
      const durationMs = Date.now() - startedAt;
      vscode.window.showInformationMessage(
        `Grafo reconstruído: ${graph.nodes.length} nós, ${graph.edges.length} arestas (${durationMs}ms)`,
      );
    }),
    vscode.commands.registerCommand('speckit.graph.show', async () => {
      const currentWorkspaceRoot = getWorkspaceRootForGraphCommand();
      if (!currentWorkspaceRoot) return;

      if (!(await graphRuntime.store.exists(currentWorkspaceRoot))) {
        vscode.window.showInformationMessage(graphUnavailableMessage());
        return;
      }

      const graphUri = vscode.Uri.file(path.join(currentWorkspaceRoot, '.speckit', 'graph.json'));
      const document = await vscode.workspace.openTextDocument(graphUri);
      await vscode.window.showTextDocument(document);
    }),
    vscode.commands.registerCommand('speckit.graph.inspect', async () => {
      const currentWorkspaceRoot = getWorkspaceRootForGraphCommand();
      if (!currentWorkspaceRoot) return;

      const graph = await graphRuntime.store.load(currentWorkspaceRoot);
      if (!graph) {
        vscode.window.showInformationMessage(graphUnavailableMessage());
        return;
      }

      const graphNodeIds = new Set(graph.nodes.map((node) => normalizeGraphNodePath(node.id)));
      const files = await vscode.workspace.findFiles(
        '**/*',
        '{**/node_modules/**,**/.git/**,**/.speckit/**,**/dist/**,**/out/**}',
        5000,
      );
      const items = files
        .map((uri) => ({
          label: normalizeGraphNodePath(path.relative(currentWorkspaceRoot, uri.fsPath)),
          description: uri.fsPath,
        }))
        .filter((item) => graphNodeIds.has(item.label))
        .sort((left, right) => left.label.localeCompare(right.label));
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Selecione um arquivo para inspecionar no grafo SpecKit',
      });
      if (!selected) return;

      const nodeId = normalizeGraphNodePath(selected.label);
      const node = graph.nodes.find((candidate) => normalizeGraphNodePath(candidate.id) === nodeId);
      if (!node) {
        vscode.window.showInformationMessage(`Arquivo não encontrado no grafo: ${selected.label}`);
        return;
      }

      const result = new GraphQuery(graph).neighbors([node.id], { topN: 20 });
      const document = await vscode.workspace.openTextDocument({
        content: renderGraphInspectionMarkdown(node.id, result),
        language: 'markdown',
      });
      await vscode.window.showTextDocument(document);
    }),
    vscode.commands.registerCommand('speckit.graph.installGuardrails', async () => {
      const result = await new UserSpaceGuardrailInstaller().install({
        dryRun: false,
        confirm: true,
      });
      vscode.window.showInformationMessage(
        `SpecKit graph guardrails instalados: ${result.written.length} arquivo(s) gravado(s).`,
      );
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

  if (workspaceRoot) {
    const headFileWatcher = new HeadFileWatcher(workspaceRoot, (prevSha, newSha) => {
      void (async () => {
        try {
          if (prevSha === null) {
            await graphRuntime.updater.buildFull(workspaceRoot);
            return;
          }

          await graphRuntime.updater.refreshFromGitDiff(workspaceRoot, prevSha, newSha);
        } catch (error) {
          console.warn('Unable to refresh graph after Git HEAD change:', error);
        }
      })();
    });
    headFileWatcher.start();
    context.subscriptions.push(headFileWatcher);
  }

  // ---------------------------------------------------------------------------
  // Coordinator: 1 listener → 2 destinos (grafo 500ms, CRAP 2000ms)
  // ---------------------------------------------------------------------------
  let postSaveTimer: ReturnType<typeof setTimeout> | undefined;

  const crapRunner = {
    run: (uri: vscode.Uri): void => {
      if (postSaveTimer) clearTimeout(postSaveTimer);
      postSaveTimer = setTimeout(() => {
        void (async () => {
          try {
            await runIncrementalCrapForSavedFile({
              fs: vscodeFileSystem,
              workspace: vscodeWorkspace,
              savedFilePath: uri.fsPath,
            });
          } catch {
            // swallow — informational only
          }
          void diagnostics?.refresh();
          void statusBar.refresh();

          await checkPostSavePendingCommit({
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
        })();
      }, POST_SAVE_DEBOUNCE_MS);
    },
  };

  const postSaveCoordinator = new PostSaveCoordinator(
    graphRuntime.updater,
    crapRunner,
    workspaceRoot ?? '',
    { crapDebounceMs: POST_SAVE_DEBOUNCE_MS },
  );
  postSaveCoordinator.start();
  context.subscriptions.push(postSaveCoordinator, {
    dispose: () => {
      if (postSaveTimer) clearTimeout(postSaveTimer);
    },
  });
}

export function deactivate(): void {}
