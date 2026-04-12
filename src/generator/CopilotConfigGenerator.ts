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
    generateIndex(story, contextSkillName),
  );

  // Skills — on-demand (loaded by description keyword match)
  await write(path.join(baselineSkillDir, 'SKILL.md'), generateBaselineSkill(story));
  await write(
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
  await write(path.join(contextSkillDir, 'SKILL.md'), generateStoryContextSkill(story));

  // Agents — on-select (loaded when user selects from dropdown)
  await write(
    path.join(agentsDir, 'speckit-implementador.agent.md'),
    generateImplementadorAgent(story),
  );
  await write(path.join(agentsDir, 'speckit-revisor.agent.md'), generateRevisorAgent(story));

  // Run prompt — monolithic mode (kept as prompt)
  await write(path.join(promptsDir, 'run.prompt.md'), generateRunPrompt(story));

  // CI workflows
  await write(path.join(workflowsDir, 'quality-gate.yml'), generateCiQualityGate(story));
  await write(path.join(workflowsDir, 'security-scan.yml'), generateCiSecurityScan());

  if (errors.length > 0 && written.length === 0) {
    throw new Error(`Falha ao gravar todos os arquivos:\n${errors.join('\n')}`);
  }

  return written;
}
