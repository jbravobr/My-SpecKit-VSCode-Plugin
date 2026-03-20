import * as path from 'path';
import { Story } from '../story/Story';
import { IFileSystem } from './utils/IFileSystem';
import { vscodeFileSystem } from './utils/VscodeFileSystem';
import { generateAgentIntegrity } from './baseline/AgentIntegrityGenerator';
import { generatePerformance } from './baseline/PerformanceGenerator';
import { generateArchitecture } from './baseline/ArchitectureGenerator';
import { generateContextManagement } from './baseline/ContextManagementGenerator';
import { generateTestingStandards } from './baseline/TestingStandardsGenerator';
import { generateGitWorkflow } from './baseline/GitWorkflowGenerator';
import { generateTypeScript } from './language/TypeScriptGenerator';
import { generateJavaScript } from './language/JavaScriptGenerator';
import { generateJava } from './language/JavaGenerator';
import { generateCSharp } from './language/CSharpGenerator';
import { generatePython } from './language/PythonGenerator';
import { generateDotNet } from './framework/DotNetGenerator';
import { generateSpringBoot } from './framework/SpringBootGenerator';
import { generateAngular } from './framework/AngularGenerator';
import { generateReact } from './framework/ReactGenerator';
import { generateFastApi } from './framework/FastApiGenerator';
import { generateBusinessContext } from './story/BusinessContextGenerator';
import { generateFunctionalSpec } from './story/FunctionalSpecGenerator';
import { generateNonFunctional } from './story/NonFunctionalGenerator';
import { generateTechStack } from './story/TechStackGenerator';
import { generateArchPattern } from './story/ArchPatternGenerator';
import { generateDod } from './story/DodGenerator';
import { generateIndex } from './story/IndexGenerator';
import { generateImplementPrompt, generateReviewPrompt, generateRunPrompt } from './story/PromptsGenerator';

export async function generateCopilotConfig(
  workspaceRoot: string,
  story: Story,
  fs: IFileSystem = vscodeFileSystem,
): Promise<string[]> {
  const githubDir = path.join(workspaceRoot, '.github');
  const instructionsDir = path.join(githubDir, 'instructions');
  const promptsDir = path.join(githubDir, 'prompts');

  await fs.ensureDir(githubDir);
  await fs.ensureDir(instructionsDir);
  await fs.ensureDir(promptsDir);

  const written: string[] = [];

  async function write(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content);
    written.push(filePath.replace(workspaceRoot + path.sep, '').replace(/\\/g, '/'));
  }

  // Index
  await write(path.join(githubDir, 'copilot-instructions.md'), generateIndex(story));

  // Baseline
  await write(path.join(instructionsDir, '00-agent-integrity.instructions.md'), generateAgentIntegrity());
  await write(path.join(instructionsDir, '01-performance.instructions.md'), generatePerformance());
  await write(path.join(instructionsDir, '02-architecture.instructions.md'), generateArchitecture());
  await write(path.join(instructionsDir, '03-context-management.instructions.md'), generateContextManagement());
  await write(path.join(instructionsDir, '04-testing-standards.instructions.md'), generateTestingStandards());
  await write(path.join(instructionsDir, '05-git-workflow.instructions.md'), generateGitWorkflow());

  // Language
  const langGenerators: Record<string, () => string> = {
    typescript: generateTypeScript,
    javascript: generateJavaScript,
    java: generateJava,
    csharp: generateCSharp,
    python: generatePython,
  };
  const langGen = story.technicalSpec.language ? langGenerators[story.technicalSpec.language] : undefined;
  if (langGen) {
    await write(path.join(instructionsDir, `lang-${story.technicalSpec.language}.instructions.md`), langGen());
  }

  // Framework
  const fwGenerators: Record<string, () => string> = {
    dotnet: generateDotNet,
    springboot: generateSpringBoot,
    angular: generateAngular,
    react: generateReact,
    fastapi: generateFastApi,
  };
  const fwGen = story.technicalSpec.framework ? fwGenerators[story.technicalSpec.framework] : undefined;
  if (fwGen) {
    await write(path.join(instructionsDir, `fw-${story.technicalSpec.framework}.instructions.md`), fwGen());
  }

  // Story-specific
  await write(path.join(instructionsDir, '10-business-context.instructions.md'), generateBusinessContext(story));
  await write(path.join(instructionsDir, '11-functional-spec.instructions.md'), generateFunctionalSpec(story));
  await write(path.join(instructionsDir, '12-nonfunctional-spec.instructions.md'), generateNonFunctional(story));
  await write(path.join(instructionsDir, '13-tech-stack.instructions.md'), generateTechStack(story));
  await write(path.join(instructionsDir, '14-architecture-pattern.instructions.md'), generateArchPattern(story));
  await write(path.join(instructionsDir, '15-dod-checklist.instructions.md'), generateDod(story));

  // Prompts
  await write(path.join(promptsDir, 'run.prompt.md'), generateRunPrompt(story));
  await write(path.join(promptsDir, 'implement.prompt.md'), generateImplementPrompt(story));
  await write(path.join(promptsDir, 'review.prompt.md'), generateReviewPrompt(story));

  return written;
}
