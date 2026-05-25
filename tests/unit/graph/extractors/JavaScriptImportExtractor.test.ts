import * as path from 'path';

import { describe, expect, it } from 'vitest';

import { JavaScriptImportExtractor } from '../../../../src/graph/extractors';

describe('JavaScriptImportExtractor', () => {
  it('extracts ES module imports, CommonJS imports and class relationships', () => {
    const workspaceRoot = path.resolve('workspace');
    const filePath = path.join(workspaceRoot, 'src', 'feature', 'sample.js');
    const content = `
      import DefaultThing from '../lib/foo.js';
      const legacy = require('../legacy');
      class BaseClass {}
      export const exportedValue = 1;
      class Derived extends BaseClass {
        create() {
          return new DefaultThing();
        }
      }
    `;

    const result = new JavaScriptImportExtractor().extract(filePath, content, workspaceRoot);

    expect(result.nodeId).toBe('src/feature/sample.js');
    expect(result.language).toBe('javascript');
    expect(result.symbols).toEqual(['BaseClass', 'exportedValue', 'Derived']);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        { to: 'src/lib/foo.js', kind: 'IMPORTS', edgeKind: 'default', confidence: 'EXTRACTED' },
        { to: 'src/legacy', kind: 'IMPORTS', edgeKind: 'default', confidence: 'EXTRACTED' },
        { to: 'BaseClass', kind: 'INHERITS', edgeKind: 'extends', confidence: 'EXTRACTED' },
        { to: 'DefaultThing', kind: 'INSTANTIATES', edgeKind: 'direct', confidence: 'EXTRACTED' },
      ]),
    );
  });

  it('supports JavaScript source files but excludes TypeScript files', () => {
    const extractor = new JavaScriptImportExtractor();

    expect(extractor.supports('src/example.js')).toBe(true);
    expect(extractor.supports('src/example.jsx')).toBe(true);
    expect(extractor.supports('src/example.mjs')).toBe(true);
    expect(extractor.supports('src/example.cjs')).toBe(true);
    expect(extractor.supports('src/example.ts')).toBe(false);
    expect(extractor.supports('src/example.d.ts')).toBe(false);
  });
});
