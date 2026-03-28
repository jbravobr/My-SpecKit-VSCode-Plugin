import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    test: {
      include: ['tests/behavioral/**/*.test.ts'],
      environment: 'node',
      alias: { vscode: resolve(__dirname, 'tests/__mocks__/vscode.ts') },
      testTimeout: 240000,
      env,
    },
  };
});
