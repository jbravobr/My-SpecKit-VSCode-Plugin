import { PLUGIN_VERSION_GRAPH, SCHEMA_VERSION } from './constants';
import type { Graph } from './types';

/**
 * Builds the workspace dependency graph from language-specific extractors.
 * This shell returns an empty, schema-valid graph until extractor logic is added.
 */
export class GraphBuilder {
  build(workspaceFolder: string): Promise<Graph> {
    void workspaceFolder;

    return Promise.resolve({
      schemaVersion: SCHEMA_VERSION,
      pluginVersion: PLUGIN_VERSION_GRAPH,
      extractorVersions: {},
      meta: {
        headSha: '',
        builtAt: new Date(0).toISOString(),
        perFileHash: {},
        perFileMtime: {},
        partialLanguages: [],
      },
      nodes: [],
      edges: [],
    });
  }
}
