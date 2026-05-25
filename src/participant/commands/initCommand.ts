import * as path from 'path';
import * as vscode from 'vscode';
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
import { GraphStore } from '../../graph/GraphStore';
import { IncrementalUpdater } from '../../graph/IncrementalUpdater';
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
    triggerGraphBuild(stream, workspaceRoot);
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
  triggerGraphBuild(stream, workspaceRoot);

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

function triggerGraphBuild(stream: vscode.ChatResponseStream, workspaceRoot: string): void {
  if (!vscode.workspace.getConfiguration('speckit.graph').get<boolean>('enabled', true)) {
    return;
  }

  const updater = new IncrementalUpdater(new GraphStore(), [
    new TypeScriptImportExtractor(),
    new JavaScriptImportExtractor(),
    new JavaImportExtractor(),
    new PythonImportExtractor(),
    new CSharpImportExtractor(),
  ]);

  void updater.buildFull(workspaceRoot).then(
    (graph) =>
      stream.markdown(
        `\n✅ Grafo construído: ${graph.nodes.length} nós, ${graph.edges.length} arestas.`,
      ),
    (error: unknown) =>
      stream.markdown(
        `\n⚠️ Falha ao construir grafo: ${error instanceof Error ? error.message : String(error)}`,
      ),
  );
}
