import * as path from 'path';
import { Fix, TechStackDetection } from '../fix/Fix';
import { generateFixImplementadorAgent } from './agent/FixImplementadorAgentGenerator';
import { generateFixRevisorAgent } from './agent/FixRevisorAgentGenerator';
import { generateFixIndex } from './fix/FixIndexGenerator';
import { generateFixRunPrompt } from './fix/FixPromptsGenerator';
import { generateBaselineSkill } from './skill/BaselineSkillGenerator';
import { generateFixContextSkill } from './skill/FixContextSkillGenerator';
import { generateStackSkill } from './skill/StackSkillGenerator';
import { IFileSystem } from './utils/IFileSystem';
import { IWorkspace } from './utils/IWorkspace';
import { vscodeFileSystem } from './utils/VscodeFileSystem';
import { vscodeWorkspace } from './utils/VscodeWorkspace';

export async function generateFixCopilotConfig(
  workspaceRoot: string,
  fix: Fix,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<string[]> {
  const stack: TechStackDetection = await workspace.detectTechStack();

  const githubDir = path.join(workspaceRoot, '.github');
  const skillsDir = path.join(githubDir, 'skills');
  const agentsDir = path.join(githubDir, 'agents');
  const promptsDir = path.join(githubDir, 'prompts');

  const baselineSkillDir = path.join(skillsDir, 'speckit-baseline');
  const stackSkillDir = path.join(skillsDir, 'speckit-stack');
  const contextSkillName = `speckit-context-FIX-${fix.metadata.id}`;
  const contextSkillDir = path.join(skillsDir, contextSkillName);

  await Promise.all([
    fs.ensureDir(githubDir),
    fs.ensureDir(skillsDir),
    fs.ensureDir(agentsDir),
    fs.ensureDir(promptsDir),
    fs.ensureDir(baselineSkillDir),
    fs.ensureDir(stackSkillDir),
    fs.ensureDir(contextSkillDir),
  ]);

  const written: string[] = [];
  const errors: string[] = [];

  async function write(filePath: string, content: string): Promise<void> {
    try {
      await fs.writeFile(filePath, content);
      written.push(filePath.replace(workspaceRoot + path.sep, '').replace(/\\/g, '/'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${filePath}: ${msg}`);
    }
  }

  // Minimal copilot-instructions.md (always-on, ~400 tokens)
  await write(
    path.join(githubDir, 'copilot-instructions.md'),
    generateFixIndex(fix, stack, contextSkillName),
  );

  // Skills — on-demand
  await write(path.join(baselineSkillDir, 'SKILL.md'), generateBaselineSkill());
  await write(
    path.join(stackSkillDir, 'SKILL.md'),
    generateStackSkill({
      language: stack.language,
      framework: stack.framework,
      infrastructure: fix.technicalContext.messaging,
      database: fix.technicalContext.database,
      target: stack.target,
    }),
  );
  await write(path.join(contextSkillDir, 'SKILL.md'), generateFixContextSkill(fix, stack));

  // Agents — on-select
  await write(
    path.join(agentsDir, 'speckit-fix-implementador.agent.md'),
    generateFixImplementadorAgent(fix, stack),
  );
  await write(
    path.join(agentsDir, 'speckit-fix-revisor.agent.md'),
    generateFixRevisorAgent(fix, stack),
  );

  // Run prompt — monolithic mode
  await write(path.join(promptsDir, 'fix-run.prompt.md'), generateFixRunPrompt(fix, stack));

  if (errors.length > 0 && written.length === 0) {
    throw new Error(`Falha ao gravar todos os arquivos:\n${errors.join('\n')}`);
  }

  return written;
}
