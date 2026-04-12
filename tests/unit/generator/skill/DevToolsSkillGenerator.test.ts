import { describe, expect, it } from 'vitest';
import { generateDevToolsSkill } from '../../../../src/generator/skill/DevToolsSkillGenerator';
import { DevToolsAssessment } from '../../../../src/generator/utils/DevToolsAssessor';

function makeAssessment(overrides: Partial<DevToolsAssessment> = {}): DevToolsAssessment {
  return {
    eslint: false,
    prettier: false,
    husky: false,
    lintStaged: false,
    missing: ['ESLint', 'Prettier', 'husky', 'lint-staged'],
    present: [],
    conflicts: [],
    allPresent: false,
    ...overrides,
  };
}

describe('generateDevToolsSkill', () => {
  it('generates YAML frontmatter with correct keywords', () => {
    const output = generateDevToolsSkill({
      language: 'typescript',
      framework: 'react',
      assessment: makeAssessment(),
    });

    expect(output).toContain('---');
    expect(output).toContain('devtools');
    expect(output).toContain('eslint');
    expect(output).toContain('prettier');
  });

  it('includes stack info in output', () => {
    const output = generateDevToolsSkill({
      language: 'java',
      framework: 'springboot',
      assessment: makeAssessment(),
    });

    expect(output).toContain('java');
    expect(output).toContain('springboot');
  });

  it('lists missing tools as items to configure', () => {
    const output = generateDevToolsSkill({
      language: 'typescript',
      framework: 'react',
      assessment: makeAssessment({ missing: ['ESLint', 'Prettier'] }),
    });

    expect(output).toContain('🔧 ESLint');
    expect(output).toContain('🔧 Prettier');
  });

  it('shows present tools with do-not-overwrite warning', () => {
    const output = generateDevToolsSkill({
      language: 'typescript',
      framework: 'react',
      assessment: makeAssessment({
        eslint: true,
        present: ['ESLint'],
        missing: ['Prettier', 'husky', 'lint-staged'],
      }),
    });

    expect(output).toContain('✅ ESLint');
    expect(output).toContain('NÃO sobrescrever');
  });

  it('shows conflict warnings for brownfield projects', () => {
    const output = generateDevToolsSkill({
      language: 'typescript',
      framework: 'react',
      assessment: makeAssessment({
        eslint: true,
        present: ['ESLint'],
        conflicts: ['ESLint: detectados arquivo legado (.eslintrc*) e flat config simultaneamente'],
        missing: ['Prettier', 'husky', 'lint-staged'],
      }),
    });

    expect(output).toContain('Conflitos detectados');
    expect(output).toContain('legado');
  });

  it('generates TypeScript ESLint instructions for TS projects', () => {
    const output = generateDevToolsSkill({
      language: 'typescript',
      framework: 'react',
      assessment: makeAssessment(),
    });

    expect(output).toContain('typescript-eslint');
    expect(output).toContain('eslint.config.mjs');
  });

  it('generates Checkstyle instructions for Java projects', () => {
    const output = generateDevToolsSkill({
      language: 'java',
      framework: 'springboot',
      assessment: makeAssessment(),
    });

    expect(output).toContain('Checkstyle');
    expect(output).toContain('maven-checkstyle-plugin');
  });

  it('generates Ruff instructions for Python projects', () => {
    const output = generateDevToolsSkill({
      language: 'python',
      framework: 'fastapi',
      assessment: makeAssessment(),
    });

    expect(output).toContain('Ruff');
    expect(output).toContain('ruff.toml');
  });

  it('generates dotnet format instructions for C# projects', () => {
    const output = generateDevToolsSkill({
      language: 'csharp',
      framework: 'dotnet',
      assessment: makeAssessment(),
    });

    expect(output).toContain('dotnet format');
    expect(output).toContain('.editorconfig');
  });

  it('generates JS ESLint instructions for JavaScript projects', () => {
    const output = generateDevToolsSkill({
      language: 'javascript',
      framework: 'angular',
      assessment: makeAssessment(),
    });

    expect(output).toContain('eslint.config.mjs');
    expect(output).toContain('angular-eslint');
  });

  it('includes validation section with 3 checks', () => {
    const output = generateDevToolsSkill({
      language: 'typescript',
      framework: 'react',
      assessment: makeAssessment(),
    });

    expect(output).toContain('npm run lint');
    expect(output).toContain('format:check');
    expect(output).toContain('Gate 1');
  });

  it('returns minimal output when all tools are present', () => {
    const output = generateDevToolsSkill({
      language: 'typescript',
      framework: 'react',
      assessment: makeAssessment({
        allPresent: true,
        missing: [],
        present: ['ESLint', 'Prettier', 'husky', 'lint-staged'],
        eslint: true,
        prettier: true,
        husky: true,
        lintStaged: true,
      }),
    });

    expect(output).toContain('Nenhuma ação necessária');
    expect(output).not.toContain('Instruções de instalação');
  });

  it('only generates instructions for missing tools, not present ones', () => {
    const output = generateDevToolsSkill({
      language: 'typescript',
      framework: 'react',
      assessment: makeAssessment({
        eslint: true,
        prettier: true,
        present: ['ESLint', 'Prettier'],
        missing: ['husky', 'lint-staged'],
      }),
    });

    // Should have husky and lint-staged instructions
    expect(output).toContain('husky');
    expect(output).toContain('lint-staged');
    // Should NOT have ESLint/Prettier install instructions
    expect(output).not.toContain('typescript-eslint');
    expect(output).not.toContain('.prettierrc');
  });

  it('generates correct lint-staged pattern for Python', () => {
    const output = generateDevToolsSkill({
      language: 'python',
      framework: 'fastapi',
      assessment: makeAssessment(),
    });

    expect(output).toContain('*.py');
    expect(output).toContain('ruff check');
  });

  it('generates correct lint-staged pattern for Java', () => {
    const output = generateDevToolsSkill({
      language: 'java',
      framework: 'springboot',
      assessment: makeAssessment(),
    });

    expect(output).toContain('*.java');
    expect(output).toContain('spotless');
  });

  it('generates Spotless instructions for Java Prettier equivalent', () => {
    const output = generateDevToolsSkill({
      language: 'java',
      framework: 'springboot',
      assessment: makeAssessment(),
    });

    expect(output).toContain('Spotless');
    expect(output).toContain('spotless-maven-plugin');
  });
});
