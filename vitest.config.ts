import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    alias: { vscode: resolve(__dirname, 'tests/__mocks__/vscode.ts') },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/extension.ts',
        'src/participant/**',
        'src/generator/utils/fileSystem.ts',
        'src/generator/utils/workspace.ts',
        'src/generator/utils/VscodeFileSystem.ts',
        'src/generator/utils/VscodeWorkspace.ts',
      ],
      reporter: ['text', 'lcov'],
    },
  },
});
