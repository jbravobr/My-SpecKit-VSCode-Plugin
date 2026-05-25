import * as path from 'path';
import * as vscode from 'vscode';
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import { findSpecFiles } from '../../generator/utils/findSpecFiles';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { CSharpImportExtractor } from '../../graph/extractors/CSharpImportExtractor';
import { JavaImportExtractor } from '../../graph/extractors/JavaImportExtractor';
import { JavaScriptImportExtractor } from '../../graph/extractors/JavaScriptImportExtractor';
import { PythonImportExtractor } from '../../graph/extractors/PythonImportExtractor';
import { TypeScriptImportExtractor } from '../../graph/extractors/TypeScriptImportExtractor';
import { GraphQuery } from '../../graph/GraphQuery';
import { GraphStore } from '../../graph/GraphStore';
import { IncrementalUpdater } from '../../graph/IncrementalUpdater';
import { parseEmbedAttributes, SubgraphEmbedder } from '../../graph/SubgraphEmbedder';
import { AuditLogger } from '../../workflow/AuditLogger';
import { emitCommandTelemetry } from '../../workflow/CommandTelemetry';
import { createCorrelationId } from '../../workflow/ObservabilityContext';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import { emitContextualCommands, emitQuickActions, requireWorkspace } from './CommandHelpers';

export async function handleInitCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const commandExecutionId = createCorrelationId('exec');
  const audit = new AuditLogger(workspaceRoot, fs);
  const tracer = new TraceabilityManager(workspaceRoot, fs);
  const telemetryBase = {
    workspaceRoot,
    fs,
    audit,
    tracer,
    commandExecutionId,
    specId: 'GLOBAL-INIT',
    specType: 'story' as const,
    llmResponseReceived: true,
  };

  const specDir = path.join(workspaceRoot, '.speckit');

  // Step 1: Ensure .speckit/ exists
  const specDirExisted = await fs.fileExists(specDir);
  if (!specDirExisted) {
    await fs.ensureDir(specDir);
  }
  const dirStatus = specDirExisted ? 'já existia' : 'criado';

  await ensureGraphIgnored(workspaceRoot, fs);
  await ensureGraphTasks(workspaceRoot, fs);

  // Step 2: Find story files recursively
  const found = await findSpecFiles(workspaceRoot, fs);

  // Filter out files already in .speckit/
  const toMove = found.filter((f) => {
    const normalized = f.relativePath.replace(/\\/g, '/');
    return !normalized.startsWith('.speckit/') && !normalized.startsWith('.speckit\\');
  });

  if (toMove.length === 0) {
    stream.markdown(
      `## ✅ Workspace inicializado\n\n` +
        `📁 \`.speckit/\` — ${dirStatus}\n` +
        `📄 Nenhum arquivo de estória encontrado fora de \`.speckit/\`.\n`,
    );
    emitContextualCommands(stream, [
      { command: '@speckit /new', description: 'criar uma nova story no template padrão' },
      { command: '@speckit /fix', description: 'criar um novo fix no template padrão' },
      { command: '@speckit /status', description: 'validar estado atual das specs' },
    ]);
    emitQuickActions(stream, [
      { title: '📝 Criar Nova Story', query: '@speckit /new' },
      { title: '📊 Ver Status das Specs', query: '@speckit /status' },
    ]);
    await triggerGraphBuild(stream, workspaceRoot, fs);
    await emitCommandTelemetry({
      ...telemetryBase,
      command: '/init',
      outcome: `📁 ${dirStatus}, 0 movidos`,
      traceDescription: 'init workspace sem movimentações',
    });
    return;
  }

  // Step 3: Move files
  const moved: string[] = [];
  const conflicts: string[] = [];

  for (const file of toMove) {
    const destPath = path.join(specDir, file.fileName);
    const exists = await fs.fileExists(destPath);

    if (exists) {
      conflicts.push(file.relativePath);
      continue;
    }

    try {
      const content = await fs.readFile(file.absolutePath);
      await fs.writeFile(destPath, content);
      await fs.deleteFile(file.absolutePath);
      moved.push(`${file.relativePath} → .speckit/${file.fileName}`);
    } catch {
      conflicts.push(`${file.relativePath} (erro ao mover)`);
    }
  }

  // Step 4: Report
  let report = `✅ Workspace inicializado.\n\n` + `📁 \`.speckit/\` — ${dirStatus}\n`;

  if (moved.length > 0) {
    report += `📄 **${moved.length}** arquivo(s) movido(s) para \`.speckit/\`:\n`;
    for (const m of moved) {
      report += `  - ${m}\n`;
    }
  }

  if (conflicts.length > 0) {
    report += `\n⚠️ **${conflicts.length}** conflito(s) — não movido(s) (já existem no destino):\n`;
    for (const c of conflicts) {
      report += `  - ${c}\n`;
    }
  }

  stream.markdown(report);
  emitContextualCommands(stream, [
    { command: '@speckit /status --all', description: 'inspecionar specs após consolidação' },
    { command: '@speckit /validate', description: 'validar a spec ativa após ajustes' },
    { command: '@speckit /trace', description: 'verificar rastreabilidade da spec ativa' },
  ]);
  emitQuickActions(stream, [
    { title: '📦 Ver Status Completo (--all)', query: '@speckit /status --all' },
    { title: '✅ Validar Spec Ativa', query: '@speckit /validate' },
  ]);
  await triggerGraphBuild(stream, workspaceRoot, fs);

  await emitCommandTelemetry({
    ...telemetryBase,
    command: '/init',
    outcome: `📁 ${dirStatus}, ${moved.length} movido(s), ${conflicts.length} conflito(s)`,
    detail: `Moved=${moved.length}; Conflicts=${conflicts.length}`,
    traceDescription: 'init workspace consolidado',
    traceData: {
      moved: String(moved.length),
      conflicts: String(conflicts.length),
    },
  });
}

interface VsCodeTaskDefinition {
  label?: unknown;
  type?: unknown;
  command?: unknown;
  problemMatcher?: unknown;
  [key: string]: unknown;
}

interface VsCodeTasksFile {
  version?: unknown;
  tasks?: unknown;
  [key: string]: unknown;
}

const SPECKIT_GRAPH_TASKS: VsCodeTaskDefinition[] = [
  {
    label: 'SpecKit: Rebuild Graph',
    type: 'shell',
    command: 'code --command speckit.graph.rebuild',
    problemMatcher: [],
  },
  {
    label: 'SpecKit: Show Graph',
    type: 'shell',
    command: 'code --command speckit.graph.show',
    problemMatcher: [],
  },
];

async function ensureGraphTasks(workspaceRoot: string, fs: IFileSystem): Promise<void> {
  const vscodeDir = path.join(workspaceRoot, '.vscode');
  const tasksPath = path.join(vscodeDir, 'tasks.json');
  const existingContent = (await fs.fileExists(tasksPath)) ? await fs.readFile(tasksPath) : '';
  const parsed = parseTasksJson(existingContent);
  const tasks = Array.isArray(parsed.tasks) ? [...parsed.tasks] : [];
  const existingLabels = new Set(
    tasks
      .map((task) => (isRecord(task) && typeof task.label === 'string' ? task.label : undefined))
      .filter((label): label is string => label !== undefined),
  );
  const missingTasks = SPECKIT_GRAPH_TASKS.filter(
    (task) => typeof task.label === 'string' && !existingLabels.has(task.label),
  );

  if (missingTasks.length === 0) {
    return;
  }

  await fs.ensureDir(vscodeDir);

  if (existingContent.trim().length === 0 || parsed.__invalid === true) {
    await fs.writeFile(
      tasksPath,
      `${JSON.stringify({ version: '2.0.0', tasks: [...tasks, ...missingTasks] }, null, 2)}\n`,
    );
    return;
  }

  await fs.writeFile(tasksPath, upsertTasksJsonc(existingContent, parsed, missingTasks));
}

function parseTasksJson(content: string): VsCodeTasksFile & { __invalid?: boolean } {
  if (content.trim().length === 0) {
    return { version: '2.0.0', tasks: [] };
  }

  const errors: ParseError[] = [];
  const parsed: unknown = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length === 0 && isRecord(parsed)) {
    return parsed;
  }

  return { version: '2.0.0', tasks: [], __invalid: true };
}

function upsertTasksJsonc(
  content: string,
  parsed: VsCodeTasksFile,
  missingTasks: VsCodeTaskDefinition[],
): string {
  let updated = content;
  const formattingOptions = { insertSpaces: true, tabSize: 2, eol: '\n' };

  if (parsed.version === undefined) {
    updated = applyEdits(updated, modify(updated, ['version'], '2.0.0', { formattingOptions }));
  }

  if (!Array.isArray(parsed.tasks)) {
    updated = applyEdits(updated, modify(updated, ['tasks'], missingTasks, { formattingOptions }));
    return updated.endsWith('\n') ? updated : `${updated}\n`;
  }

  for (const task of missingTasks) {
    updated = applyEdits(updated, modify(updated, ['tasks', -1], task, { formattingOptions }));
  }

  return updated.endsWith('\n') ? updated : `${updated}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function ensureGraphIgnored(workspaceRoot: string, fs: IFileSystem): Promise<void> {
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  const graphIgnoreEntry = '.speckit/graph.json';
  const existing = (await fs.fileExists(gitignorePath)) ? await fs.readFile(gitignorePath) : '';
  const hasEntry = existing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .includes(graphIgnoreEntry);

  if (hasEntry) {
    return;
  }

  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  await fs.writeFile(gitignorePath, `${existing}${separator}${graphIgnoreEntry}\n`);
}

async function triggerGraphBuild(
  stream: vscode.ChatResponseStream,
  workspaceRoot: string,
  fs: IFileSystem,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('speckit.graph');
  if (!config.get<boolean>('enabled', true)) {
    return;
  }

  const store = new GraphStore();
  const updater = new IncrementalUpdater(store, [
    new TypeScriptImportExtractor(),
    new JavaScriptImportExtractor(),
    new JavaImportExtractor(),
    new PythonImportExtractor(),
    new CSharpImportExtractor(),
  ]);

  try {
    const graph = await updater.buildFull(workspaceRoot);
    stream.markdown(
      `\n✅ Grafo construído: ${graph.nodes.length} nós, ${graph.edges.length} arestas.`,
    );

    if (config.get<string>('embed.mode', 'subgraph') === 'off') {
      return;
    }

    const graphBlock = new SubgraphEmbedder(graph, new GraphQuery(graph)).generate({
      topN: config.get<number>('embed.topN', 20),
      attributes: parseEmbedAttributes(config.get<unknown[]>('embed.attributes', [])),
    });
    const updated = await upsertGraphBlockInInstructions(workspaceRoot, fs, graphBlock);
    if (updated) {
      stream.markdown('\n✅ GRAPH CONTEXT atualizado em `copilot-instructions.md`.');
    }
  } catch (error: unknown) {
    stream.markdown(
      `\n⚠️ Falha ao construir grafo: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function upsertGraphBlockInInstructions(
  workspaceRoot: string,
  fs: IFileSystem,
  graphBlock: string,
): Promise<boolean> {
  const instructionsPath = path.join(workspaceRoot, '.github', 'copilot-instructions.md');
  if (!(await fs.fileExists(instructionsPath))) {
    return false;
  }

  const current = await fs.readFile(instructionsPath);
  const withoutPreviousGraph = current.replace(/\n*## GRAPH CONTEXT[\s\S]*$/u, '').trimEnd();
  await fs.writeFile(instructionsPath, `${withoutPreviousGraph}\n\n${graphBlock.trim()}\n`);
  return true;
}
