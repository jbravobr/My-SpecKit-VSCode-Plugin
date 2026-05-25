import { describe, expect, it } from 'vitest';
import { JavaImportExtractor } from '../../../../src/graph/extractors/JavaImportExtractor';

describe('JavaImportExtractor', () => {
  it('extracts imports, inheritance, implementations, instantiations and top-level symbols', () => {
    const extractor = new JavaImportExtractor();
    const content = `
// import ignored.Commented;
/*
import ignored.Block;
*/
import java.util.List;
import com.example.*;

public class OrderService extends BaseService<String> implements Runnable, Handler<Map<String, Integer>> {
  void run() {
    new OrderClient();
  }

  class Inner {}
}
`;

    const result = extractor.extract('C:\\repo\\src\\OrderService.java', content, 'C:\\repo');

    expect(result.nodeId).toBe('src/OrderService.java');
    expect(result.symbols).toEqual(['OrderService']);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        { to: 'java.util.List', kind: 'IMPORTS', edgeKind: 'direct', confidence: 'INFERRED' },
        { to: 'com.example.*', kind: 'IMPORTS', edgeKind: 'direct', confidence: 'AMBIGUOUS' },
        { to: 'BaseService', kind: 'INHERITS', edgeKind: 'extends', confidence: 'INFERRED' },
        { to: 'Runnable', kind: 'INHERITS', edgeKind: 'implements', confidence: 'INFERRED' },
        { to: 'Handler', kind: 'INHERITS', edgeKind: 'implements', confidence: 'AMBIGUOUS' },
        { to: 'OrderClient', kind: 'INSTANTIATES', edgeKind: 'direct', confidence: 'INFERRED' },
      ]),
    );
    expect(result.edges).not.toContainEqual(expect.objectContaining({ to: 'ignored.Commented' }));
    expect(result.edges).not.toContainEqual(expect.objectContaining({ to: 'ignored.Block' }));
  });
});
