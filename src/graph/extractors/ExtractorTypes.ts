export interface ExtractedFile {
  nodeId: string;
  language: string;
  symbols: string[];
  edges: Array<{
    to: string;
    kind: 'IMPORTS' | 'INHERITS' | 'INSTANTIATES';
    edgeKind?: string;
    confidence: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
  }>;
}

export interface ImportExtractor {
  readonly language: string;
  readonly version: string;
  readonly partial: boolean;
  supports(filePath: string): boolean;
  extract(filePath: string, content: string, workspaceRoot: string): ExtractedFile;
}
