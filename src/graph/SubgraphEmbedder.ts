import type { Graph, GraphEdge, GraphNode } from './types';
import { GraphQuery, type Subgraph } from './GraphQuery';

export interface EmbedOptions {
  topN?: number;
  attributes?: EmbedAttribute[];
  storyEntities?: string[];
}

export type EmbedAttribute = 'confidence' | 'riskScore' | 'edgeKind' | 'diffSinceLastGate';

interface FanCounts {
  fanIn: number;
  fanOut: number;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function shortSha(value: string | undefined): string {
  return value === undefined || value.length === 0 ? 'uncommitted' : value.slice(0, 7);
}

export function parseEmbedAttributes(values: unknown[] | undefined): EmbedAttribute[] {
  const allowed = new Set<string>(['confidence', 'riskScore', 'edgeKind', 'diffSinceLastGate']);
  const result: EmbedAttribute[] = [];

  for (const value of values ?? []) {
    if (typeof value === 'string' && allowed.has(value)) {
      result.push(value as EmbedAttribute);
      continue;
    }

    console.warn(`Ignoring invalid speckit.graph.embed.attributes value: ${String(value)}`);
  }

  return result;
}

function uniqueAttributes(attributes: EmbedAttribute[] | undefined): Set<EmbedAttribute> {
  return new Set(attributes ?? []);
}

/** Formats graph query results into Markdown for generated Copilot artifacts. */
export class SubgraphEmbedder {
  private readonly fanCountsByNodeId: Map<string, FanCounts>;

  constructor(
    private readonly graph: Graph,
    private readonly query: GraphQuery,
  ) {
    this.fanCountsByNodeId = this.buildFanCounts();
  }

  /** Gera o bloco markdown completo para inserção no copilot-instructions.md. */
  generate(opts?: EmbedOptions): string {
    if (this.graph.nodes.length === 0) {
      return '## GRAPH CONTEXT\n\n> Grafo vazio (workspace greenfield ou build pendente).\n';
    }

    const topN = Math.max(1, Math.floor(opts?.topN ?? 20));
    const attributes = uniqueAttributes(opts?.attributes);
    const lines = [
      `## GRAPH CONTEXT (.speckit/graph.json @ ${shortSha(this.graph.meta.headSha)})`,
      '',
    ];

    if (this.graph.meta.partialLanguages.length > 0) {
      lines.push(`> ⚠️ Cobertura parcial em: ${this.graph.meta.partialLanguages.join(', ')}.`, '');
    }

    if (attributes.has('diffSinceLastGate') && this.graph.meta.lastGateSha !== undefined) {
      lines.push(
        `- alterações desde último gate: HEAD=${shortSha(this.graph.meta.headSha)} meta.lastGateSha=${shortSha(this.graph.meta.lastGateSha)}`,
        '',
      );
    }

    lines.push('### Top dependências (risco fan-in+fan-out)');
    for (const node of this.query.topRiskNodes(topN)) {
      lines.push(this.formatTopNode(node, attributes));
    }

    if (opts?.storyEntities !== undefined && opts.storyEntities.length > 0) {
      lines.push('', '### Vizinhos da story');
      lines.push(
        ...this.formatStoryNeighbors(
          this.query.neighbors(opts.storyEntities, { topN }),
          attributes,
        ),
      );
    }

    lines.push(
      '',
      '### Como usar este contexto',
      '- Priorize arquivos com maior fanIn/fanOut antes de propor edições.',
      '- Antes de alterar um nó, confira importadores e dependências diretas.',
      '- Use vizinhos da story para localizar impacto provável do requisito ativo.',
      '- Se a cobertura for parcial, valide manualmente linguagens não extraídas.',
    );

    return `${lines.join('\n')}\n`;
  }

  /** Variante condensada (~150 tokens) para skills secundárias. */
  generateCondensed(opts?: EmbedOptions): string {
    if (this.graph.nodes.length === 0) {
      return 'GRAPH CONTEXT: grafo vazio.';
    }

    const topN = Math.max(1, Math.floor(opts?.topN ?? 20));
    const nodes = this.query
      .topRiskNodes(Math.min(topN, 5))
      .map((node) => {
        const counts = this.countsFor(node.id);
        return `${normalizePath(node.id)} fanIn=${counts.fanIn} fanOut=${counts.fanOut}`;
      })
      .join('; ');

    return `GRAPH CONTEXT @ ${shortSha(this.graph.meta.headSha)}: ${nodes}.`;
  }

  private formatTopNode(node: GraphNode, attributes: Set<EmbedAttribute>): string {
    const nodeId = normalizePath(node.id);
    const counts = this.countsFor(nodeId);
    const suffix = attributes.has('riskScore') ? ` risk=${this.query.riskScore(nodeId)}` : '';
    return `- \`${nodeId}\` — fanIn=${counts.fanIn} fanOut=${counts.fanOut}${suffix}`;
  }

  private formatStoryNeighbors(subgraph: Subgraph, attributes: Set<EmbedAttribute>): string[] {
    if (subgraph.nodes.length === 0) {
      return ['- Nenhum vizinho encontrado para as entidades da story.'];
    }

    const lines = subgraph.nodes.map((node) => {
      const nodeId = normalizePath(node.id);
      const counts = this.countsFor(nodeId);
      const suffix = attributes.has('riskScore') ? ` risk=${this.query.riskScore(nodeId)}` : '';
      return `- \`${nodeId}\` — fanIn=${counts.fanIn} fanOut=${counts.fanOut}${suffix}`;
    });

    for (const edge of subgraph.edges) {
      lines.push(this.formatStoryEdge(edge, attributes));
    }

    return lines;
  }

  private formatStoryEdge(edge: GraphEdge, attributes: Set<EmbedAttribute>): string {
    const annotations: string[] = [];
    if (attributes.has('edgeKind')) {
      annotations.push(`[${edge.kind}]`);
    }
    if (attributes.has('confidence')) {
      annotations.push(`[confidence=${edge.confidence}]`);
    }

    const suffix = annotations.length > 0 ? ` ${annotations.join(' ')}` : '';
    return `  - \`${normalizePath(edge.from)}\` → \`${normalizePath(edge.to)}\`${suffix}`;
  }

  private countsFor(nodeId: string): FanCounts {
    return this.fanCountsByNodeId.get(normalizePath(nodeId)) ?? { fanIn: 0, fanOut: 0 };
  }

  private buildFanCounts(): Map<string, FanCounts> {
    const counts = new Map<string, FanCounts>();

    for (const node of this.graph.nodes) {
      counts.set(normalizePath(node.id), { fanIn: 0, fanOut: 0 });
    }

    for (const edge of this.graph.edges) {
      const from = normalizePath(edge.from);
      const to = normalizePath(edge.to);
      const fromCounts = counts.get(from) ?? { fanIn: 0, fanOut: 0 };
      const toCounts = counts.get(to) ?? { fanIn: 0, fanOut: 0 };
      fromCounts.fanOut += 1;
      toCounts.fanIn += 1;
      counts.set(from, fromCounts);
      counts.set(to, toCounts);
    }

    return counts;
  }
}
