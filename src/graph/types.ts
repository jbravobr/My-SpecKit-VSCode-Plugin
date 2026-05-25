export interface GraphNode {
  id: string;
  language: string;
  symbols: string[];
}

export type EdgeKind = 'IMPORTS' | 'INHERITS' | 'INSTANTIATES';

export type EdgeConfidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  edgeKind?: string;
  confidence: EdgeConfidence;
  sourceExtractor: string;
}

export interface GraphMeta {
  headSha?: string;
  lastGateSha?: string;
  builtAt: string;
  perFileHash: Record<string, string>;
  perFileMtime: Record<string, number>;
  partialLanguages: string[];
}

export interface Graph {
  schemaVersion: string;
  pluginVersion: string;
  extractorVersions: Record<string, string>;
  meta: GraphMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type SubgraphAttribute = 'confidence' | 'riskScore' | 'edgeKind' | 'diffSinceLastGate';

export type EmbedMode = 'subgraph' | 'summary' | 'off';
