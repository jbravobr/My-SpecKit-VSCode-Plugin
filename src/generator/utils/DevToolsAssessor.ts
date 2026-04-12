import { IFileSystem } from './IFileSystem';

export interface DevToolsAssessment {
  eslint: boolean;
  prettier: boolean;
  husky: boolean;
  lintStaged: boolean;
  /** Items that are missing and can be offered */
  missing: string[];
  /** Items already present in the project */
  present: string[];
  /** Warnings about potential conflicts (brownfield) */
  conflicts: string[];
  /** True when everything is already configured */
  allPresent: boolean;
}

export async function assessDevTools(
  workspaceRoot: string,
  fs: IFileSystem,
): Promise<DevToolsAssessment> {
  const [eslint, prettier, husky, lintStaged] = await Promise.all([
    detectEslint(workspaceRoot, fs),
    detectPrettier(workspaceRoot, fs),
    detectHusky(workspaceRoot, fs),
    detectLintStaged(workspaceRoot, fs),
  ]);

  const missing: string[] = [];
  const present: string[] = [];
  const conflicts: string[] = [];

  if (eslint) {
    present.push('ESLint');
  } else {
    missing.push('ESLint');
  }

  if (prettier) {
    present.push('Prettier');
  } else {
    missing.push('Prettier');
  }

  if (husky) {
    present.push('husky');
  } else {
    missing.push('husky');
  }

  if (lintStaged) {
    present.push('lint-staged');
  } else {
    missing.push('lint-staged');
  }

  // Brownfield conflict detection
  if (eslint) {
    const hasLegacy = await hasAnyFile(workspaceRoot, fs, [
      '.eslintrc',
      '.eslintrc.js',
      '.eslintrc.json',
      '.eslintrc.yml',
      '.eslintrc.yaml',
      '.eslintrc.cjs',
    ]);
    const hasFlat = await hasAnyFile(workspaceRoot, fs, [
      'eslint.config.js',
      'eslint.config.mjs',
      'eslint.config.cjs',
      'eslint.config.ts',
    ]);
    if (hasLegacy && hasFlat) {
      conflicts.push(
        'ESLint: detectados arquivo legado (.eslintrc*) e flat config (eslint.config.*) simultaneamente',
      );
    }
  }

  return {
    eslint,
    prettier,
    husky,
    lintStaged,
    missing,
    present,
    conflicts,
    allPresent: missing.length === 0,
  };
}

async function detectEslint(root: string, fs: IFileSystem): Promise<boolean> {
  return hasAnyFile(root, fs, [
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.json',
    '.eslintrc.yml',
    '.eslintrc.yaml',
    '.eslintrc.cjs',
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts',
  ]);
}

async function detectPrettier(root: string, fs: IFileSystem): Promise<boolean> {
  return hasAnyFile(root, fs, [
    '.prettierrc',
    '.prettierrc.js',
    '.prettierrc.json',
    '.prettierrc.yml',
    '.prettierrc.yaml',
    '.prettierrc.cjs',
    'prettier.config.js',
    'prettier.config.mjs',
    'prettier.config.cjs',
  ]);
}

async function detectHusky(root: string, fs: IFileSystem): Promise<boolean> {
  return hasAnyFile(root, fs, ['.husky/pre-commit']);
}

async function detectLintStaged(root: string, fs: IFileSystem): Promise<boolean> {
  if (
    await hasAnyFile(root, fs, ['.lintstagedrc', '.lintstagedrc.json', 'lint-staged.config.js'])
  ) {
    return true;
  }
  // Check package.json for lint-staged key
  try {
    const pkgContent = await fs.readFile(root + '/package.json');
    if (pkgContent) {
      const pkg = JSON.parse(pkgContent);
      return 'lint-staged' in pkg;
    }
  } catch {
    // package.json missing or invalid — not present
  }
  return false;
}

async function hasAnyFile(root: string, fs: IFileSystem, filenames: string[]): Promise<boolean> {
  const results = await Promise.all(filenames.map((f) => fs.fileExists(root + '/' + f)));
  return results.some(Boolean);
}
