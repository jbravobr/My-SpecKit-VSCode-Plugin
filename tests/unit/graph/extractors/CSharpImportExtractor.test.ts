import { describe, expect, it } from 'vitest';
import { CSharpImportExtractor } from '../../../../src/graph/extractors/CSharpImportExtractor';

describe('CSharpImportExtractor', () => {
  it('extracts usings, ambiguous inheritance, instantiations and top-level symbols', () => {
    const extractor = new CSharpImportExtractor();
    const content = `
// using Ignored.Commented;
/* using Ignored.Block; */
global using System.Text;
using static System.Math;
using MyApp.Core;

namespace MyApp.Services {
  public partial class OrderService : BaseService<Order>, IOrderService, IDisposable {
    public void Run() {
      var client = new OrderClient();
    }
  }
}
`;

    const result = extractor.extract('C:\\repo\\src\\OrderService.cs', content, 'C:\\repo');

    expect(result.nodeId).toBe('src/OrderService.cs');
    expect(result.symbols).toEqual(['OrderService']);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        { to: 'System.Text', kind: 'IMPORTS', edgeKind: 'using', confidence: 'INFERRED' },
        { to: 'System.Math', kind: 'IMPORTS', edgeKind: 'using', confidence: 'INFERRED' },
        { to: 'MyApp.Core', kind: 'IMPORTS', edgeKind: 'using', confidence: 'INFERRED' },
        {
          to: 'BaseService',
          kind: 'INHERITS',
          edgeKind: 'extends-or-implements',
          confidence: 'AMBIGUOUS',
        },
        {
          to: 'IOrderService',
          kind: 'INHERITS',
          edgeKind: 'extends-or-implements',
          confidence: 'AMBIGUOUS',
        },
        {
          to: 'IDisposable',
          kind: 'INHERITS',
          edgeKind: 'extends-or-implements',
          confidence: 'AMBIGUOUS',
        },
        { to: 'OrderClient', kind: 'INSTANTIATES', edgeKind: 'direct', confidence: 'INFERRED' },
      ]),
    );
    expect(result.edges).not.toContainEqual(expect.objectContaining({ to: 'Ignored.Commented' }));
    expect(result.edges).not.toContainEqual(expect.objectContaining({ to: 'Ignored.Block' }));
  });
});
