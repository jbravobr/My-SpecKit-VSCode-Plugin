import * as path from 'path';
import * as vscode from 'vscode';
import type { IFileSystem } from '../../generator/utils/IFileSystem';
import type { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { ensureGraphExists } from '../../graph/GraphAutoBuilder';
import { GraphQuery } from '../../graph/GraphQuery';
import { GraphStore } from '../../graph/GraphStore';
import type { GraphEdge } from '../../graph/types';
import { emitContextualCommands, emitQuickActions, handleCommandError, requireWorkspace } from './CommandHelpers';

function riskEmoji(score: number): string {
  if (score >= 80) return '🔴';
  if (score >= 60) return '🟠';
  if (score >= 30) return '🟡';
  return '🟢';
}

function edgeRelationship(edges: GraphEdge[], nodeId: string, rootIds: Set<string>): string {
  const relationships: string[] = [];
  for (const edge of edges) {
    if (edge.from === nodeId && rootIds.has(edge.to)) {
      relationships.push(`${edge.kind.toLowerCase()} →`);
    } else if (edge.to === nodeId && rootIds.has(edge.from)) {
      relationships.push(`← ${edge.kind.toLowerCase()}`);
    }
  }
  return relationships.length > 0 ? relationships.join(', ') : 'transitive';
}

function resolveTargetEntity(prompt: string, _workspaceRoot: string): string | undefined {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) return undefined;
  // Normalize to forward slashes for graph lookup
  return trimmed.replace(/\\/g, '/');
}

export async function handleImpactCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  try {
    // Ensure graph exists (silent build if needed)
    const ensureResult = await ensureGraphExists(workspaceRoot, fs);
    if (!ensureResult.fresh && ensureResult.error) {
      stream.markdown(
        `## ⚠️ Graph indisponível\n\n` +
          `Não foi possível construir o graph de dependências: ${ensureResult.error}\n\n` +
          `Execute \`@speckit /init\` para inicializar o workspace.\n`,
      );
      emitQuickActions(stream, [{ title: '🔧 Inicializar', query: '@speckit /init' }]);
      return;
    }

    // Load graph
    const store = new GraphStore('.speckit/graph.json', fs);
    const graph = await store.load(workspaceRoot);
    if (!graph) {
      stream.markdown('❌ Graph não encontrado mesmo após build. Execute `@speckit /init`.\n');
      return;
    }

    // Determine target entity
    let entity = resolveTargetEntity(request.prompt, workspaceRoot);
    if (!entity) {
      const activePath = await workspace.getActiveSpecPath();
      if (activePath) {
        entity = path.relative(workspaceRoot, activePath).replace(/\\/g, '/');
      }
    }

    if (!entity) {
      stream.markdown(
        '❌ Nenhum arquivo ou símbolo fornecido.\n\n' +
          'Uso: `@speckit /impact src/path/to/File.ts` ou abra um arquivo antes de executar.\n',
      );
      return;
    }

    // Query graph
    const query = new GraphQuery(graph);
    const subgraph = query.neighbors([entity], { hops: 2, topN: 15 });

    if (subgraph.nodes.length === 0) {
      stream.markdown(
        `## 💥 Impact Analysis — \`${entity}\`\n\n` +
          `Nenhum nó encontrado no graph para \`${entity}\`.\n\n` +
          `Verifique se o caminho está correto ou se o graph está atualizado (\`@speckit /doctor\`).\n`,
      );
      emitQuickActions(stream, [{ title: '🩺 Doctor', query: '@speckit /doctor' }]);
      return;
    }

    // Calculate risk scores
    const rootScore = query.riskScore(entity);
    const rootIds = new Set([entity]);
    const affectedNodes = subgraph.nodes
      .filter((n) => n.id !== entity)
      .map((n) => ({
        node: n,
        risk: query.riskScore(n.id),
        relationship: edgeRelationship(subgraph.edges, n.id, rootIds),
      }))
      .sort((a, b) => b.risk - a.risk);

    // Build report
    const lines: string[] = [];
    lines.push(`## 💥 Impact Analysis — \`${entity}\``);
    lines.push('');
    lines.push(`### Risk Score: ${rootScore}/100 ${riskEmoji(rootScore)}`);
    lines.push('');

    if (affectedNodes.length === 0) {
      lines.push('Nenhum nó afetado encontrado (arquivo isolado no graph).');
    } else {
      lines.push(`### Nós afetados (blast radius): ${affectedNodes.length}`);
      lines.push('');
      lines.push('| Nó | Linguagem | Risk | Relação |');
      lines.push('|---|---|---:|---|');
      for (const { node, risk, relationship } of affectedNodes) {
        lines.push(`| \`${node.id}\` | ${node.language} | ${riskEmoji(risk)} ${risk} | ${relationship} |`);
      }
      lines.push('');

      // Suggested tests
      const highRiskNodes = affectedNodes.filter((n) => n.risk >= 60);
      if (highRiskNodes.length > 0) {
        lines.push('### 🧪 Testes sugeridos');
        lines.push('');
        lines.push('Nós com risco ≥ 60 devem ter cobertura de testes verificada:');
        for (const { node, risk } of highRiskNodes) {
          lines.push(`- ${riskEmoji(risk)} \`${node.id}\` (risk: ${risk}) — verificar cobertura e edge cases`);
        }
      }
    }

    stream.markdown(lines.join('\n') + '\n');
    emitContextualCommands(stream, [
      { command: '/validate', description: 'Validar spec ativa' },
      { command: '/review-auto', description: 'Executar revisão automática' },
    ]);
    emitQuickActions(stream, [
      { title: '✅ Validar', query: '@speckit /validate' },
      { title: '🔄 Review Auto', query: '@speckit /review-auto' },
    ]);
  } catch (err) {
    handleCommandError(err, stream, 'Erro ao analisar impacto');
  }
}
