import * as path from 'path';
import { Story } from '../story/Story';
import { generateImplementadorAgent } from './agent/StoryImplementadorAgentGenerator';
import { generateRevisorAgent } from './agent/StoryRevisorAgentGenerator';
import { generateCiQualityGate, generateCiSecurityScan } from './ci/CiGenerator';
import { generateBaselineSkill } from './skill/BaselineSkillGenerator';
import { generateStackSkill } from './skill/StackSkillGenerator';
import { generateStoryContextSkill } from './skill/StoryContextSkillGenerator';
import { generateIndex } from './story/IndexGenerator';
import { generateRunPrompt } from './story/PromptsGenerator';
import { IFileSystem } from './utils/IFileSystem';
import { vscodeFileSystem } from './utils/VscodeFileSystem';
import { WriteTransaction } from './utils/WriteTransaction';

export async function generateCopilotConfig(
  workspaceRoot: string,
  story: Story,
  fs: IFileSystem = vscodeFileSystem,
): Promise<string[]> {
  const githubDir = path.join(workspaceRoot, '.github');
  const skillsDir = path.join(githubDir, 'skills');
  const agentsDir = path.join(githubDir, 'agents');
  const promptsDir = path.join(githubDir, 'prompts');
  const workflowsDir = path.join(githubDir, 'workflows');

  const baselineSkillDir = path.join(skillsDir, 'speckit-baseline');
  const stackSkillDir = path.join(skillsDir, 'speckit-stack');
  const contextSkillName = `speckit-context-STORY-${story.metadata.id}`;
  const contextSkillDir = path.join(skillsDir, contextSkillName);

  await Promise.all([
    fs.ensureDir(githubDir),
    fs.ensureDir(skillsDir),
    fs.ensureDir(agentsDir),
    fs.ensureDir(promptsDir),
    fs.ensureDir(workflowsDir),
    fs.ensureDir(baselineSkillDir),
    fs.ensureDir(stackSkillDir),
    fs.ensureDir(contextSkillDir),
  ]);

  const tx = new WriteTransaction(fs, workspaceRoot);

  // Minimal copilot-instructions.md (always-on, ~400 tokens)
  await tx.write(
    path.join(githubDir, 'copilot-instructions.md'),
    generateIndex(story, contextSkillName),
  );

  // Skills — on-demand (loaded by description keyword match)
  await tx.write(path.join(baselineSkillDir, 'SKILL.md'), generateBaselineSkill(story));
  await tx.write(
    path.join(stackSkillDir, 'SKILL.md'),
    generateStackSkill(
      {
        language: story.technicalSpec.language,
        framework: story.technicalSpec.framework,
        infrastructure: story.technicalSpec.infrastructure,
        database: story.technicalSpec.database,
        target: story.technicalSpec.target,
      },
      story,
    ),
  );
  await tx.write(path.join(contextSkillDir, 'SKILL.md'), generateStoryContextSkill(story));

  // Agents — on-select (loaded when user selects from dropdown)
  await tx.write(
    path.join(agentsDir, 'speckit-implementador.agent.md'),
    generateImplementadorAgent(story),
  );
  await tx.write(path.join(agentsDir, 'speckit-revisor.agent.md'), generateRevisorAgent(story));

  // Run prompt — monolithic mode (kept as prompt)
  await tx.write(path.join(promptsDir, 'run.prompt.md'), generateRunPrompt(story));

  // CI workflows
  await tx.write(path.join(workflowsDir, 'quality-gate.yml'), generateCiQualityGate(story));
  await tx.write(path.join(workflowsDir, 'security-scan.yml'), generateCiSecurityScan());

  return tx.commit();
}
