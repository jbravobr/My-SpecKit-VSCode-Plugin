import * as path from 'path';
import { Fix, TechStackDetection } from '../fix/Fix';
import { IFileSystem } from './utils/IFileSystem';
import { IWorkspace } from './utils/IWorkspace';
import { vscodeFileSystem } from './utils/VscodeFileSystem';
import { vscodeWorkspace } from './utils/VscodeWorkspace';
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
import { generateFixContext } from './fix/FixContextGenerator';
import { generateRootCause } from './fix/RootCauseGenerator';
import { generateImpact } from './fix/ImpactGenerator';
import { generateRegression } from './fix/RegressionGenerator';
import { generateFixDof } from './fix/FixDofGenerator';
import { generateFixIndex } from './fix/FixIndexGenerator';
import {
  generateFixImplementPrompt,
  generateFixReviewPrompt,
  generateFixRunPrompt,
} from './fix/FixPromptsGenerator';

export async function generateFixCopilotConfig(
  workspaceRoot: string,
  fix: Fix,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<string[]> {
  const stack: TechStackDetection = await workspace.detectTechStack();

  const githubDir = path.join(workspaceRoot, '.github');
  const instructionsDir = path.join(githubDir, 'instructions');
  const promptsDir = path.join(githubDir, 'prompts');

  await Promise.all([
    fs.ensureDir(githubDir),
    fs.ensureDir(instructionsDir),
    fs.ensureDir(promptsDir),
  ]);

  const written: string[] = [];

  async function write(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content);
    written.push(filePath.replace(workspaceRoot + path.sep, '').replace(/\\/g, '/'));
  }

  // Index
  await write(path.join(githubDir, 'copilot-instructions.md'), generateFixIndex(fix, stack));

  // Baseline
  await write(path.join(instructionsDir, '00-agent-integrity.instructions.md'), generateAgentIntegrity());
  await write(path.join(instructionsDir, '01-performance.instructions.md'), generatePerformance());
  await write(path.join(instructionsDir, '02-architecture.instructions.md'), generateArchitecture());
  await write(path.join(instructionsDir, '03-context-management.instructions.md'), generateContextManagement());
  await write(path.join(instructionsDir, '04-testing-standards.instructions.md'), generateTestingStandards());
  await write(path.join(instructionsDir, '05-git-workflow.instructions.md'), generateGitWorkflow());

  // Language (auto-detected)
  const langGenerators: Record<string, () => string> = {
    typescript: generateTypeScript,
    javascript: generateJavaScript,
    java: generateJava,
    csharp: generateCSharp,
    python: generatePython,
  };
  const langGen = langGenerators[stack.language];
  if (langGen) {
    await write(path.join(instructionsDir, `lang-${stack.language}.instructions.md`), langGen());
  }

  // Framework (auto-detected)
  const fwGenerators: Record<string, () => string> = {
    dotnet: generateDotNet,
    springboot: generateSpringBoot,
    angular: generateAngular,
    react: generateReact,
    fastapi: generateFastApi,
  };
  const fwGen = fwGenerators[stack.framework];
  if (fwGen) {
    await write(path.join(instructionsDir, `fw-${stack.framework}.instructions.md`), fwGen());
  }

  // Fix-specific instructions
  await write(path.join(instructionsDir, '10-fix-context.instructions.md'), generateFixContext(fix));
  await write(path.join(instructionsDir, '11-root-cause.instructions.md'), generateRootCause(fix));
  await write(path.join(instructionsDir, '12-fix-impact.instructions.md'), generateImpact(fix));
  await write(path.join(instructionsDir, '13-regression-prevention.instructions.md'), generateRegression(fix));
  await write(path.join(instructionsDir, '14-fix-dof.instructions.md'), generateFixDof(fix));

  // Prompts
  await write(path.join(promptsDir, 'fix-run.prompt.md'), generateFixRunPrompt(fix, stack));
  await write(path.join(promptsDir, 'fix-implement.prompt.md'), generateFixImplementPrompt(fix, stack));
  await write(path.join(promptsDir, 'fix-review.prompt.md'), generateFixReviewPrompt(fix, stack));

  return written;
}
