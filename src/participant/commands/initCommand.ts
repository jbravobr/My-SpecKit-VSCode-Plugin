import * as path from 'path';
import * as vscode from 'vscode';
import { findSpecFiles } from '../../generator/utils/findSpecFiles';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { appendLog } from '../../generator/utils/SessionLogger';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { requireWorkspace } from './CommandHelpers';

export async function handleInitCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

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
      `✅ Workspace inicializado.\n\n` +
        `📁 \`.speckit/\` — ${dirStatus}\n` +
        `📄 Nenhum arquivo de estória encontrado fora de \`.speckit/\`.\n`,
    );
    await appendLog(workspaceRoot, { command: '/init', outcome: `📁 ${dirStatus}, 0 movidos` }, fs);
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

  await appendLog(
    workspaceRoot,
    {
      command: '/init',
      outcome: `📁 ${dirStatus}, ${moved.length} movido(s), ${conflicts.length} conflito(s)`,
    },
    fs,
  );
}
