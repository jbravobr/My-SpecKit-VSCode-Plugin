import { describe, expect, it } from 'vitest';

const loadVsixHelpers = () => import('../../../scripts/lib/vsix.mjs');

describe('VSIX packaging guard', () => {
  it('flags forbidden development artifacts', async () => {
    const { findForbiddenEntries } = await loadVsixHelpers();
    const forbiddenEntries = findForbiddenEntries([
      'extension/dist/extension.js',
      'extension/coverage/index.html',
      'extension/assets/diagrams/01-fluxo-resumo.mmd',
      'extension/assets/speckit_icon.png',
      'extension/scripts/package-vsix.mjs',
      'extension/tests/unit/example.test.ts',
    ]);

    expect(forbiddenEntries).toEqual([
      'extension/coverage/index.html',
      'extension/assets/diagrams/01-fluxo-resumo.mmd',
      'extension/scripts/package-vsix.mjs',
      'extension/tests/unit/example.test.ts',
    ]);
  });

  it('accepts a runtime-only extension payload', async () => {
    const { assertNoForbiddenEntries } = await loadVsixHelpers();
    expect(() =>
      assertNoForbiddenEntries([
        'extension.vsixmanifest',
        '[Content_Types].xml',
        'extension/package.json',
        'extension/README.md',
        'extension/dist/extension.js',
        'extension/assets/speckit_icon.png',
      ]),
    ).not.toThrow();
  });

  it('throws with the offending paths when forbidden content is present', async () => {
    const { assertNoForbiddenEntries } = await loadVsixHelpers();
    expect(() =>
      assertNoForbiddenEntries([
        'extension/dist/extension.js',
        'extension/coverage/lcov-report/index.html',
      ]),
    ).toThrow('extension/coverage/lcov-report/index.html');
  });
});
