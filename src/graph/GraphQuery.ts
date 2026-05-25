import type { Graph, GraphEdge, GraphNode } from './types';

export interface NeighborOptions {
  hops?: number;
  topN?: number;
}

export interface Subgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type GraphNeighborsOptions = NeighborOptions;
export type GraphNeighborsResult = Subgraph;

function normalizeNodeId(id: string): string {
  return id.replace(/\\/g, '/');
}

/** Answers graph traversal queries for entities relevant to an active story. */
export class GraphQuery {
  private readonly nodesById = new Map<string, GraphNode>();
  private readonly normalizedEdges: GraphEdge[];
  private readonly riskCache = new Map<string, number>();
  private maxRawRisk: number | undefined;

  constructor(private readonly graph: Graph) {
    for (const node of graph.nodes) {
      this.nodesById.set(normalizeNodeId(node.id), { ...node, id: normalizeNodeId(node.id) });
    }

    this.normalizedEdges = graph.edges.map((edge) => ({
      ...edge,
      from: normalizeNodeId(edge.from),
      to: normalizeNodeId(edge.to),
    }));
  }

  /**
   * Returns root-touching edges for 1-hop traversal by default.
   * Entities can be normalized node IDs or case-sensitive symbols.
   */
  neighbors(entities: string[], opts?: NeighborOptions): Subgraph {
    const hops = Math.max(1, Math.floor(opts?.hops ?? 1));
    const topN = Math.max(1, Math.floor(opts?.topN ?? 20));
    const roots = this.resolveEntities(entities);

    if (roots.length === 0) {
      return { nodes: [], edges: [] };
    }

    const rootIds = new Set(roots.map((node) => node.id));
    const candidateIds = new Set(rootIds);
    const candidateEdges = new Map<string, GraphEdge>();
    let frontier = new Set(rootIds);

    for (let depth = 0; depth < hops; depth += 1) {
      const nextFrontier = new Set<string>();

      for (const edge of this.normalizedEdges) {
        const touchesFrontier = frontier.has(edge.from) || frontier.has(edge.to);
        if (!touchesFrontier) {
          continue;
        }

        candidateEdges.set(this.edgeKey(edge), edge);

        for (const nodeId of [edge.from, edge.to]) {
          if (!candidateIds.has(nodeId) && this.nodesById.has(nodeId)) {
            candidateIds.add(nodeId);
            nextFrontier.add(nodeId);
          }
        }
      }

      frontier = nextFrontier;
      if (frontier.size === 0) {
        break;
      }
    }

    const selectedIds = this.applyTopN(candidateIds, rootIds, topN);
    const nodes = Array.from(selectedIds)
      .map((nodeId) => this.nodesById.get(nodeId))
      .filter((node): node is GraphNode => node !== undefined)
      .sort((left, right) => left.id.localeCompare(right.id));
    const edges = Array.from(candidateEdges.values())
      .filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))
      .sort((left, right) => this.edgeKey(left).localeCompare(this.edgeKey(right)));

    return { nodes, edges };
  }

  /** Scores IMPORTS fan-in/out plus reverse INHERITS and reverse INSTANTIATES, normalized to 0..100. */
  riskScore(nodeId: string): number {
    const normalizedNodeId = normalizeNodeId(nodeId);
    const cached = this.riskCache.get(normalizedNodeId);
    if (cached !== undefined) {
      return cached;
    }

    if (this.nodesById.size === 0 || !this.nodesById.has(normalizedNodeId)) {
      this.riskCache.set(normalizedNodeId, 0);
      return 0;
    }

    const maxRaw = this.getMaxRawRisk();
    const score = maxRaw === 0 ? 0 : Math.round((this.rawRisk(normalizedNodeId) / maxRaw) * 100);
    this.riskCache.set(normalizedNodeId, score);
    return score;
  }

  topRiskNodes(n: number): GraphNode[] {
    const limit = Math.max(0, Math.floor(n));
    return Array.from(this.nodesById.values())
      .sort((left, right) => this.compareByRisk(left.id, right.id))
      .slice(0, limit);
  }

  private resolveEntities(entities: string[]): GraphNode[] {
    const resolved = new Map<string, GraphNode>();

    for (const entity of entities) {
      const normalizedEntity = normalizeNodeId(entity);
      const byId = this.nodesById.get(normalizedEntity);
      if (byId !== undefined) {
        resolved.set(byId.id, byId);
        continue;
      }

      for (const node of this.nodesById.values()) {
        if (node.symbols.includes(entity)) {
          resolved.set(node.id, node);
        }
      }
    }

    return Array.from(resolved.values()).sort((left, right) => left.id.localeCompare(right.id));
  }

  private applyTopN(candidateIds: Set<string>, rootIds: Set<string>, topN: number): Set<string> {
    if (candidateIds.size <= topN) {
      return candidateIds;
    }

    const sortedNonRoots = Array.from(candidateIds)
      .filter((nodeId) => !rootIds.has(nodeId))
      .sort((left, right) => this.compareByRisk(left, right));
    const selected = new Set(rootIds);
    const remainingSlots = Math.max(0, topN - selected.size);

    for (const nodeId of sortedNonRoots.slice(0, remainingSlots)) {
      selected.add(nodeId);
    }

    return selected;
  }

  private compareByRisk(leftId: string, rightId: string): number {
    const riskDelta = this.riskScore(rightId) - this.riskScore(leftId);
    return riskDelta === 0 ? leftId.localeCompare(rightId) : riskDelta;
  }

  private getMaxRawRisk(): number {
    if (this.maxRawRisk !== undefined) {
      return this.maxRawRisk;
    }

    this.maxRawRisk = Array.from(this.nodesById.keys()).reduce(
      (max, nodeId) => Math.max(max, this.rawRisk(nodeId)),
      0,
    );
    return this.maxRawRisk;
  }

  private rawRisk(nodeId: string): number {
    let fanIn = 0;
    let fanOut = 0;
    let numHeirs = 0;
    let numInstantiators = 0;

    for (const edge of this.normalizedEdges) {
      if (edge.kind === 'IMPORTS') {
        if (edge.to === nodeId) {
          fanIn += 1;
        }
        if (edge.from === nodeId) {
          fanOut += 1;
        }
      }

      if (edge.kind === 'INHERITS' && edge.to === nodeId) {
        numHeirs += 1;
      }

      if (edge.kind === 'INSTANTIATES' && edge.to === nodeId) {
        numInstantiators += 1;
      }
    }

    return fanIn + fanOut + numHeirs + numInstantiators;
  }

  private edgeKey(edge: GraphEdge): string {
    return `${edge.from}\u0000${edge.kind}\u0000${edge.to}\u0000${edge.edgeKind ?? ''}`;
  }
}
