import type { EmbedMode, GraphEdge, GraphNode, SubgraphAttribute } from './types';

export interface SubgraphEmbedOptions {
  mode: EmbedMode;
  topN: number;
  attributes: SubgraphAttribute[];
}

export interface SubgraphEmbedInput {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Formats graph query results into Markdown for generated Copilot artifacts.
 * This shell emits the stable GRAPH CONTEXT marker with placeholder content.
 */
export class SubgraphEmbedder {
  embed(subgraph: SubgraphEmbedInput, opts: SubgraphEmbedOptions): string {
    void subgraph;

    const attributes = opts.attributes.length > 0 ? opts.attributes.join(', ') : 'none';

    return [
      '## GRAPH CONTEXT',
      '',
      `> Status: pending. Mode: ${opts.mode}. Top-N: ${opts.topN}. Attributes: ${attributes}.`,
      '',
    ].join('\n');
  }
}
