import { describe, expect, it } from 'vitest';
import { PythonImportExtractor } from '../../../../src/graph/extractors/PythonImportExtractor';

describe('PythonImportExtractor', () => {
  it('extracts imports, inheritance and top-level symbols while skipping comments and docstrings', () => {
    const extractor = new PythonImportExtractor();
    const content = `
"""
import hidden.module
class Hidden(Base):
    pass
"""
# import commented.module
import os.path as osp
from package.submodule import Thing

class Service(BaseOne, mixins.BaseTwo):
    def method(self):
        Builder()

def top_level():
    __import__('plugins.dynamic')
`;

    const result = extractor.extract('C:\\repo\\src\\service.py', content, 'C:\\repo');

    expect(result.nodeId).toBe('src/service.py');
    expect(result.symbols).toEqual(['Service', 'top_level']);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        { to: 'os.path', kind: 'IMPORTS', edgeKind: 'direct', confidence: 'INFERRED' },
        { to: 'package.submodule', kind: 'IMPORTS', edgeKind: 'from', confidence: 'INFERRED' },
        { to: 'BaseOne', kind: 'INHERITS', edgeKind: 'extends', confidence: 'INFERRED' },
        { to: 'mixins.BaseTwo', kind: 'INHERITS', edgeKind: 'extends', confidence: 'INFERRED' },
        { to: 'plugins.dynamic', kind: 'IMPORTS', edgeKind: 'dynamic', confidence: 'AMBIGUOUS' },
      ]),
    );
    expect(result.edges).not.toContainEqual(
      expect.objectContaining({ to: 'Builder', kind: 'INSTANTIATES' }),
    );
    expect(result.edges).not.toContainEqual(expect.objectContaining({ to: 'hidden.module' }));
    expect(result.edges).not.toContainEqual(expect.objectContaining({ to: 'commented.module' }));
  });
});
