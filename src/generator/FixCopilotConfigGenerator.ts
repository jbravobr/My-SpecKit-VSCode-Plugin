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
import { WriteTransaction } from './utils/WriteTransaction';

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

  const tx = new WriteTransaction(fs, workspaceRoot);

  // Minimal copilot-instructions.md (always-on, ~400 tokens)
  await tx.write(
    path.join(githubDir, 'copilot-instructions.md'),
    generateFixIndex(fix, stack, contextSkillName),
  );

  // Skills — on-demand
  await tx.write(path.join(baselineSkillDir, 'SKILL.md'), generateBaselineSkill());
  await tx.write(
    path.join(stackSkillDir, 'SKILL.md'),
    generateStackSkill({
      language: stack.language,
      framework: stack.framework,
      infrastructure: fix.technicalContext.messaging,
      database: fix.technicalContext.database,
      target: stack.target,
    }),
  );
  await tx.write(path.join(contextSkillDir, 'SKILL.md'), generateFixContextSkill(fix, stack));

  // Agents — on-select
  await tx.write(
    path.join(agentsDir, 'speckit-fix-implementador.agent.md'),
    generateFixImplementadorAgent(fix, stack),
  );
  await tx.write(
    path.join(agentsDir, 'speckit-fix-revisor.agent.md'),
    generateFixRevisorAgent(fix, stack),
  );

  // Run prompt — monolithic mode
  await tx.write(path.join(promptsDir, 'fix-run.prompt.md'), generateFixRunPrompt(fix, stack));

  return tx.commit();
}
