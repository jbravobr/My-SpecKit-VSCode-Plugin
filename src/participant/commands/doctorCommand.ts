import * as path from 'path';
import * as vscode from 'vscode';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { requireWorkspace } from './CommandHelpers';

interface DiagResult {
  label: string;
  ok: boolean;
  detail?: string;
}

export async function handleDoctorCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const specDir = path.join(workspaceRoot, '.speckit');
  const githubDir = path.join(workspaceRoot, '.github');
  const defaultsPath = path.join(specDir, 'defaults.yml');

  const [speckitExists, githubExists, defaultsExists, storyFiles, fixFiles, techStack] =
    await Promise.all([
      fs.fileExists(specDir),
      fs.fileExists(githubDir),
      fs.fileExists(defaultsPath),
      workspace.listStoryFiles(specDir).catch(() => [] as string[]),
      workspace.listFixFiles(specDir).catch(() => [] as string[]),
      workspace.detectTechStack().catch(() => null),
    ]);

  const checks: DiagResult[] = [
    { label: '.speckit/', ok: speckitExists },
    { label: '.github/', ok: githubExists },
    { label: 'defaults.yml', ok: defaultsExists },
    { label: 'Stories', ok: storyFiles.length > 0, detail: `${storyFiles.length} encontrada(s)` },
    { label: 'Fixes', ok: fixFiles.length > 0, detail: `${fixFiles.length} encontrado(s)` },
    {
      label: 'Tech Stack',
      ok: techStack !== null,
      detail: techStack
        ? `${techStack.language} / ${techStack.framework} (${techStack.confidence})`
        : 'não detectado',
    },
  ];

  const lines = checks.map((c) => {
    const icon = c.ok ? '✅' : '❌';
    const detail = c.detail ? ` — ${c.detail}` : '';
    return `| ${icon} | ${c.label}${detail} |`;
  });

  const healthy = checks.filter((c) => c.ok).length;
  const total = checks.length;

  stream.markdown(
    `## 🩺 Diagnóstico do Workspace\n\n` +
      `| Status | Item |\n|--------|------|\n${lines.join('\n')}\n\n` +
      `**Resultado:** ${healthy}/${total} verificações OK\n`,
  );
}
