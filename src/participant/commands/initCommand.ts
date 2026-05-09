import * as path from 'path';
import * as vscode from 'vscode';
import { findSpecFiles } from '../../generator/utils/findSpecFiles';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
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
