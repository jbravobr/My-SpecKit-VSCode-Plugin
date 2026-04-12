import { Framework, Language } from '../../story/Story';
import { DevToolsAssessment } from '../utils/DevToolsAssessor';

export interface DevToolsSkillInput {
  language: Language;
  framework: Framework;
  assessment: DevToolsAssessment;
}

export function generateDevToolsSkill(input: DevToolsSkillInput): string {
  const { language, framework, assessment } = input;
  const sections: string[] = [];

  sections.push(`---
description: >-
  Instruções para configurar ferramentas de qualidade de código no projeto.
  Ativado por keywords: devtools, lint, eslint, prettier, format, husky, pre-commit.
globs: '**'
---

# DevTools — Configuração de qualidade de código

> **Gerado pelo SpecKit.** Este skill instrui o agente a configurar ESLint, Prettier,
> husky e lint-staged adequados à stack do projeto.
> Aplique estas instruções durante o **Gate 0 (Alinhamento)** antes de começar a implementação.

## Stack detectada

- **Linguagem:** ${language}
- **Framework:** ${framework}`);

  if (assessment.present.length > 0) {
    sections.push(`
## Ferramentas já presentes (NÃO sobrescrever)

${assessment.present.map((t) => `- ✅ ${t} — já configurado no projeto`).join('\n')}

> **IMPORTANTE:** Não altere configurações existentes dessas ferramentas.
> Apenas integre-se a elas.`);
  }

  if (assessment.conflicts.length > 0) {
    sections.push(`
## ⚠️ Conflitos detectados

${assessment.conflicts.map((c) => `- ${c}`).join('\n')}

> Resolva estes conflitos antes de prosseguir com novas configurações.`);
  }

  if (assessment.missing.length === 0) {
    sections.push(`
## Status

Todas as ferramentas de qualidade já estão configuradas. Nenhuma ação necessária.`);
    return sections.join('\n');
  }

  sections.push(`
## Ferramentas a configurar

${assessment.missing.map((t) => `- 🔧 ${t}`).join('\n')}

### Instruções de instalação`);

  if (!assessment.eslint) {
    sections.push(generateEslintInstructions(language, framework));
  }

  if (!assessment.prettier) {
    sections.push(generatePrettierInstructions(language));
  }

  if (!assessment.husky) {
    sections.push(generateHuskyInstructions());
  }

  if (!assessment.lintStaged) {
    sections.push(generateLintStagedInstructions(language));
  }

  sections.push(`
## Validação

Após configurar, execute:

1. \`npm run lint\` (ou equivalente) — deve passar sem erros
2. \`npm run format:check\` (ou equivalente) — deve reportar zero diferenças
3. Faça um commit de teste — o hook pre-commit deve executar lint-staged

> Não prossiga para o Gate 1 sem validar os 3 pontos acima.`);

  return sections.join('\n');
}

function generateEslintInstructions(language: Language, framework: Framework): string {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return generateJsEslint(language, framework);
    case 'java':
      return `
#### ESLint (Java → Checkstyle)

Para projetos Java, use Checkstyle em vez de ESLint:

1. Adicione o plugin ao \`pom.xml\`:
   \`\`\`xml
   <plugin>
     <groupId>org.apache.maven.plugins</groupId>
     <artifactId>maven-checkstyle-plugin</artifactId>
     <version>3.3.1</version>
     <configuration>
       <configLocation>google_checks.xml</configLocation>
       <failOnViolation>true</failOnViolation>
     </configuration>
   </plugin>
   \`\`\`
2. Adicione ao script de verificação: \`mvn checkstyle:check\``;
    case 'csharp':
      return `
#### ESLint (C# → dotnet format + analyzers)

Para projetos C#, use dotnet format + Roslyn analyzers:

1. Adicione ao \`.csproj\`:
   \`\`\`xml
   <PropertyGroup>
     <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
     <AnalysisLevel>latest-recommended</AnalysisLevel>
   </PropertyGroup>
   \`\`\`
2. Crie \`.editorconfig\` com regras de estilo
3. Verifique com: \`dotnet format --verify-no-changes\``;
    case 'python':
      return `
#### ESLint (Python → Ruff)

Para projetos Python, use Ruff (linter + formatter ultrarrápido):

1. Instale: \`pip install ruff\` ou adicione ao \`requirements-dev.txt\`
2. Crie \`ruff.toml\`:
   \`\`\`toml
   target-version = "py311"
   line-length = 100

   [lint]
   select = ["E", "F", "W", "I", "N", "UP", "B", "SIM", "S"]
   \`\`\`
3. Verifique com: \`ruff check .\``;
    default:
      return '';
  }
}

function generateJsEslint(language: Language, framework: Framework): string {
  const isTs = language === 'typescript';
  const parser = isTs ? 'typescript-eslint' : '@eslint/js';
  const deps = isTs
    ? '`eslint @eslint/js typescript-eslint eslint-config-prettier`'
    : '`eslint @eslint/js eslint-config-prettier`';

  let frameworkPlugin = '';
  if (framework === 'react') {
    frameworkPlugin = `
4. Adicione \`eslint-plugin-react\` e \`eslint-plugin-react-hooks\` às devDependencies`;
  } else if (framework === 'angular') {
    frameworkPlugin = `
4. Adicione \`@angular-eslint/eslint-plugin\` às devDependencies`;
  }

  return `
#### ESLint (${language})

1. Instale como devDependencies: ${deps}
2. Crie \`eslint.config.mjs\` (flat config — ESLint v9+):
   \`\`\`js
   import js from "@eslint/js";${isTs ? '\n   import tseslint from "typescript-eslint";' : ''}
   import eslintConfigPrettier from "eslint-config-prettier";

   export default ${isTs ? 'tseslint.config(' : '['}
     js.configs.recommended,${isTs ? '\n     ...tseslint.configs.recommended,' : ''}
     eslintConfigPrettier
   ${isTs ? ');' : '];'}
   \`\`\`
3. Adicione ao \`package.json\`: \`"lint": "${parser === 'typescript-eslint' ? 'eslint .' : 'eslint .'}"\`${frameworkPlugin}`;
}

function generatePrettierInstructions(language: Language): string {
  switch (language) {
    case 'java':
      return `
#### Prettier (Java → Spotless)

Para projetos Java, use Spotless com Google Java Format:

1. Adicione ao \`pom.xml\`:
   \`\`\`xml
   <plugin>
     <groupId>com.diffplug.spotless</groupId>
     <artifactId>spotless-maven-plugin</artifactId>
     <version>2.43.0</version>
     <configuration>
       <java>
         <googleJavaFormat/>
       </java>
     </configuration>
   </plugin>
   \`\`\`
2. Formate com: \`mvn spotless:apply\`
3. Verifique com: \`mvn spotless:check\``;
    case 'csharp':
      return `
#### Prettier (C# → dotnet format)

Para projetos C#, o \`dotnet format\` já cobre formatação:

1. Configure regras em \`.editorconfig\`
2. Formate com: \`dotnet format\`
3. Verifique com: \`dotnet format --verify-no-changes\``;
    case 'python':
      return `
#### Prettier (Python → Ruff format)

Ruff já inclui formatter integrado:

1. Formate com: \`ruff format .\`
2. Verifique com: \`ruff format --check .\``;
    default:
      return `
#### Prettier (${language})

1. Instale: \`npm install --save-dev prettier\`
2. Crie \`.prettierrc\`:
   \`\`\`json
   {
     "semi": true,
     "singleQuote": true,
     "trailingComma": "all",
     "printWidth": 100,
     "tabWidth": 2,
     "endOfLine": "auto"
   }
   \`\`\`
3. Crie \`.prettierignore\` (dist, node_modules, coverage)
4. Adicione ao \`package.json\`: \`"format": "prettier --write 'src/**/*.{ts,js}'"\`
5. Adicione: \`"format:check": "prettier --check 'src/**/*.{ts,js}'"\``;
  }
}

function generateHuskyInstructions(): string {
  return `
#### husky (pre-commit hooks)

1. Instale: \`npm install --save-dev husky\`
2. Inicialize: \`npx husky init\`
3. O arquivo \`.husky/pre-commit\` será criado automaticamente
4. Configure o conteúdo do hook (veja lint-staged abaixo)`;
}

function generateLintStagedInstructions(language: Language): string {
  let pattern: string;
  let cmds: string;

  switch (language) {
    case 'typescript':
    case 'javascript':
      pattern = '"*.ts"';
      cmds = '["eslint --fix", "prettier --write"]';
      break;
    case 'java':
      pattern = '"*.java"';
      cmds = '["mvn spotless:apply"]';
      break;
    case 'csharp':
      pattern = '"*.cs"';
      cmds = '["dotnet format --include"]';
      break;
    case 'python':
      pattern = '"*.py"';
      cmds = '["ruff check --fix", "ruff format"]';
      break;
    default:
      pattern = '"*"';
      cmds = '["eslint --fix"]';
  }

  return `
#### lint-staged (lint apenas nos arquivos staged)

1. Instale: \`npm install --save-dev lint-staged\`
2. Adicione ao \`package.json\`:
   \`\`\`json
   "lint-staged": {
     ${pattern}: ${cmds}
   }
   \`\`\`
3. Configure \`.husky/pre-commit\`:
   \`\`\`sh
   npx lint-staged
   \`\`\``;
}
