import { describe, expect, it } from 'vitest';
import { assessDevTools } from '../../../src/generator/utils/DevToolsAssessor';
import { InMemoryFileSystem } from '../../support/fakes';

describe('assessDevTools', () => {
  const root = 'C:/workspace';

  it('reports all missing in a greenfield project with no tooling', async () => {
    const fs = new InMemoryFileSystem();
    const result = await assessDevTools(root, fs);

    expect(result.allPresent).toBe(false);
    expect(result.missing).toEqual(['ESLint', 'Prettier', 'husky', 'lint-staged']);
    expect(result.present).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('detects ESLint flat config (eslint.config.mjs)', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(root + '/eslint.config.mjs', 'export default [];');

    const result = await assessDevTools(root, fs);

    expect(result.eslint).toBe(true);
    expect(result.present).toContain('ESLint');
    expect(result.missing).not.toContain('ESLint');
  });

  it('detects ESLint legacy config (.eslintrc.json)', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(root + '/.eslintrc.json', '{}');

    const result = await assessDevTools(root, fs);

    expect(result.eslint).toBe(true);
    expect(result.present).toContain('ESLint');
  });

  it('detects Prettier (.prettierrc)', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(root + '/.prettierrc', '{}');

    const result = await assessDevTools(root, fs);

    expect(result.prettier).toBe(true);
    expect(result.present).toContain('Prettier');
    expect(result.missing).not.toContain('Prettier');
  });

  it('detects Prettier (prettier.config.mjs)', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(root + '/prettier.config.mjs', 'export default {};');

    const result = await assessDevTools(root, fs);

    expect(result.prettier).toBe(true);
  });

  it('detects husky via .husky/pre-commit', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(root + '/.husky/pre-commit', 'npx lint-staged');

    const result = await assessDevTools(root, fs);

    expect(result.husky).toBe(true);
    expect(result.present).toContain('husky');
    expect(result.missing).not.toContain('husky');
  });

  it('detects lint-staged from package.json lint-staged key', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(
      root + '/package.json',
      JSON.stringify({ 'lint-staged': { '*.ts': ['eslint --fix'] } }),
    );

    const result = await assessDevTools(root, fs);

    expect(result.lintStaged).toBe(true);
    expect(result.present).toContain('lint-staged');
    expect(result.missing).not.toContain('lint-staged');
  });

  it('detects lint-staged from standalone config file', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(root + '/.lintstagedrc', '{}');

    const result = await assessDevTools(root, fs);

    expect(result.lintStaged).toBe(true);
  });

  it('reports allPresent=true when everything is configured', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(root + '/eslint.config.mjs', 'export default [];');
    await fs.writeFile(root + '/.prettierrc', '{}');
    await fs.writeFile(root + '/.husky/pre-commit', 'npx lint-staged');
    await fs.writeFile(
      root + '/package.json',
      JSON.stringify({ 'lint-staged': { '*.ts': ['eslint --fix'] } }),
    );

    const result = await assessDevTools(root, fs);

    expect(result.allPresent).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(['ESLint', 'Prettier', 'husky', 'lint-staged']);
  });

  it('detects conflict when both legacy and flat ESLint configs exist', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(root + '/.eslintrc.json', '{}');
    await fs.writeFile(root + '/eslint.config.mjs', 'export default [];');

    const result = await assessDevTools(root, fs);

    expect(result.eslint).toBe(true);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0]).toContain('legado');
  });

  it('handles partial tooling — only ESLint and Prettier present', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(root + '/.eslintrc.cjs', 'module.exports = {};');
    await fs.writeFile(root + '/.prettierrc.yml', 'semi: true');

    const result = await assessDevTools(root, fs);

    expect(result.eslint).toBe(true);
    expect(result.prettier).toBe(true);
    expect(result.husky).toBe(false);
    expect(result.lintStaged).toBe(false);
    expect(result.present).toEqual(['ESLint', 'Prettier']);
    expect(result.missing).toEqual(['husky', 'lint-staged']);
    expect(result.allPresent).toBe(false);
  });

  it('handles missing package.json gracefully for lint-staged check', async () => {
    const fs = new InMemoryFileSystem();
    // No package.json at all

    const result = await assessDevTools(root, fs);

    expect(result.lintStaged).toBe(false);
  });

  it('handles invalid package.json gracefully', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile(root + '/package.json', 'not json');

    const result = await assessDevTools(root, fs);

    expect(result.lintStaged).toBe(false);
  });
});
