import * as path from 'path';

import { describe, expect, it } from 'vitest';

import { TypeScriptImportExtractor } from '../../../../src/graph/extractors';

describe('TypeScriptImportExtractor', () => {
  it('extracts imports, inheritance, instantiation and top-level symbols', () => {
    const workspaceRoot = path.resolve('workspace');
    const filePath = path.join(workspaceRoot, 'src', 'feature', 'sample.ts');
    const content = `
      import DefaultThing, { NamedThing } from '../lib/foo';
      import * as NamespaceThing from '../lib/ns';
      import legacy = require('../legacy');
      export { ReExported } from '../barrel';

      class BaseClass {}
      interface Contract {}
      type Alias = string;
      enum Kind { A }
      function helper() {}
      export const exportedValue = 1;
      class Derived extends BaseClass implements Contract {
        create() {
          return new NamedThing();
        }
      }
    `;

    const result = new TypeScriptImportExtractor().extract(filePath, content, workspaceRoot);

    expect(result.nodeId).toBe('src/feature/sample.ts');
    expect(result.language).toBe('typescript');
    expect(result.symbols).toEqual([
      'BaseClass',
      'Contract',
      'Alias',
      'Kind',
      'helper',
      'exportedValue',
      'Derived',
    ]);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        { to: 'src/lib/foo', kind: 'IMPORTS', edgeKind: 'default', confidence: 'EXTRACTED' },
        { to: 'src/lib/foo', kind: 'IMPORTS', edgeKind: 'named', confidence: 'EXTRACTED' },
        { to: 'src/lib/ns', kind: 'IMPORTS', edgeKind: 'namespace', confidence: 'EXTRACTED' },
        { to: 'src/legacy', kind: 'IMPORTS', edgeKind: 'named', confidence: 'EXTRACTED' },
        { to: 'src/barrel', kind: 'IMPORTS', edgeKind: 'named', confidence: 'EXTRACTED' },
        { to: 'BaseClass', kind: 'INHERITS', edgeKind: 'extends', confidence: 'EXTRACTED' },
        { to: 'Contract', kind: 'INHERITS', edgeKind: 'implements', confidence: 'EXTRACTED' },
        { to: 'NamedThing', kind: 'INSTANTIATES', edgeKind: 'direct', confidence: 'EXTRACTED' },
      ]),
    );
  });

  it('supports TypeScript source files but excludes declaration files', () => {
    const extractor = new TypeScriptImportExtractor();

    expect(extractor.supports('src/example.ts')).toBe(true);
    expect(extractor.supports('src/example.tsx')).toBe(true);
    expect(extractor.supports('src/example.mts')).toBe(true);
    expect(extractor.supports('src/example.cts')).toBe(true);
    expect(extractor.supports('src/example.d.ts')).toBe(false);
    expect(extractor.supports('src/example.js')).toBe(false);
  });

  it('returns an empty extraction for malformed TypeScript', () => {
    const workspaceRoot = path.resolve('workspace');
    const filePath = path.join(workspaceRoot, 'src', 'broken.ts');

    const result = new TypeScriptImportExtractor().extract(filePath, 'import {', workspaceRoot);

    expect(result).toEqual({
      nodeId: 'src/broken.ts',
      language: 'typescript',
      symbols: [],
      edges: [],
    });
  });
});
