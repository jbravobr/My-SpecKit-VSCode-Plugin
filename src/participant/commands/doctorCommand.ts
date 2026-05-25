import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { GraphifyDetector } from '../../graph/GraphifyDetector';
import { readCurrentHeadSha } from '../../graph/GraphInspectionEvidence';
import { UserSpaceGuardrailInstaller } from '../../graph/UserSpaceGuardrailInstaller';
import type { Graph } from '../../graph/types';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { emitContextualCommands, emitQuickActions, requireWorkspace } from './CommandHelpers';

interface DiagResult {
  label: string;
  ok: boolean;
  detail?: string;
}

interface GraphDiagRow {
  check: string;
  status: string;
  detail: string;
}

function shortSha(sha: string | undefined): string {
  if (sha === undefined || sha.length === 0) {
    return 'uncommitted';
  }
  return sha.length > 7 ? sha.slice(0, 7) : sha;
}

function isGraph(value: unknown): value is Graph {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<Graph>;
  return (
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges) &&
    candidate.meta !== undefined &&
    (candidate.meta.headSha === undefined || typeof candidate.meta.headSha === 'string')
  );
}

async function buildGraphDiagnostics(
  workspaceRoot: string,
  fs: IFileSystem,
  homeDir: string = os.homedir(),
): Promise<GraphDiagRow[]> {
  const graphPath = path.join(workspaceRoot, '.speckit', 'graph.json');
  let graph: Graph | null = null;
  let graphBuild: GraphDiagRow;

  if (await fs.fileExists(graphPath)) {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(graphPath)) as unknown;
      if (isGraph(parsed)) {
        graph = parsed;
        graphBuild = {
          check: 'Graph build',
          status: '✅',
          detail: `${graph.nodes.length} nós, ${graph.edges.length} arestas`,
        };
      } else {
        graphBuild = { check: 'Graph build', status: '⚠️', detail: 'graph.json inválido' };
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'erro ao ler graph.json';
      graphBuild = { check: 'Graph build', status: '⚠️', detail };
    }
  } else {
    graphBuild = { check: 'Graph build', status: '❌', detail: '.speckit/graph.json ausente' };
  }

  const currentHead = await readCurrentHeadSha(workspaceRoot);
  const graphFresh: GraphDiagRow =
    graph === null
      ? { check: 'Graph fresh', status: '⚠️', detail: 'meta.headSha indisponível' }
      : currentHead !== null && graph.meta.headSha === currentHead
        ? { check: 'Graph fresh', status: '✅', detail: `meta=${shortSha(graph.meta.headSha)}` }
        : {
            check: 'Graph fresh',
            status: '⚠️',
            detail: `meta=${shortSha(graph.meta.headSha)}, HEAD=${currentHead ? shortSha(currentHead) : 'desconhecido'}`,
          };

  const graphify = await new GraphifyDetector().detect(workspaceRoot);
  const graphifyRow: GraphDiagRow = graphify.found
    ? { check: 'Graphify externo', status: '✅', detail: graphify.sources[0] ?? 'detectado' }
    : { check: 'Graphify externo', status: '➖', detail: 'não detectado — usando store interno' };

  const guardrails = await UserSpaceGuardrailInstaller.status(homeDir);
  const guardrailsDetail = guardrails.installed
    ? `${guardrails.path} instalado${guardrails.version ? ` (versão ${guardrails.version})` : ''}${
        guardrails.mtime ? `, mtime=${guardrails.mtime.toISOString()}` : ''
      }`
    : `${guardrails.path} não instalado`;

  return [
    graphBuild,
    graphFresh,
    graphifyRow,
    {
      check: 'Guardrails user-space',
      status: guardrails.installed ? '✅' : '⚠️',
      detail: guardrailsDetail,
    },
  ];
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

  const [speckitExists, githubExists, defaultsExists, storyFiles, fixFiles, techStack, graphRows] =
    await Promise.all([
      fs.fileExists(specDir),
      fs.fileExists(githubDir),
      fs.fileExists(defaultsPath),
      workspace.listStoryFiles(specDir).catch(() => [] as string[]),
      workspace.listFixFiles(specDir).catch(() => [] as string[]),
      workspace.detectTechStack().catch(() => null),
      buildGraphDiagnostics(workspaceRoot, fs),
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

  const graphLines = graphRows
    .map((row) => `| ${row.check} | ${row.status} | ${row.detail} |`)
    .join('\n');
  stream.markdown(
    `\n## Diagnóstico do grafo\n\n` +
      `| Check | Status | Detalhe |\n|---|---|---|\n${graphLines}\n`,
  );

  emitContextualCommands(stream, [
    { command: '@speckit /init', description: 'inicializar e consolidar estrutura .speckit' },
    { command: '@speckit /status', description: 'inspecionar stories/fixes detectados' },
    { command: '@speckit /help', description: 'consultar comandos para corrigir gaps' },
  ]);
  emitQuickActions(stream, [
    { title: '🚀 Executar Inicialização (/init)', query: '@speckit /init' },
    { title: '📊 Ver Status das Specs', query: '@speckit /status' },
  ]);
}
