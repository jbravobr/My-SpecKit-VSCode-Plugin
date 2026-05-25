import * as path from 'path';
import * as vscode from 'vscode';
import { GraphQuery } from '../graph/GraphQuery';
import { GraphStore } from '../graph/GraphStore';
import { parseEmbedAttributes, SubgraphEmbedder } from '../graph/SubgraphEmbedder';
import { Story } from '../story/Story';
import { generateImplementadorAgent } from './agent/StoryImplementadorAgentGenerator';
import { generateRevisorAgent } from './agent/StoryRevisorAgentGenerator';
import { generateCiQualityGate, generateCiSecurityScan } from './ci/CiGenerator';
import { generateCorpSkills } from './corp/CorpSkillsGenerator';
import { generateBaselineSkill } from './skill/BaselineSkillGenerator';
import { generateHandoffSkill } from './skill/HandoffSkillGenerator';
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
  const handoffSkillDir = path.join(skillsDir, 'speckit-handoff');
  const contextSkillName = `speckit-context-STORY-${story.metadata.id}`;
  const contextSkillDir = path.join(skillsDir, contextSkillName);

  const ciEnabled = story.technicalSpec.ci !== 'none';

  const dirPromises = [
    fs.ensureDir(githubDir),
    fs.ensureDir(skillsDir),
    fs.ensureDir(agentsDir),
    fs.ensureDir(promptsDir),
    fs.ensureDir(baselineSkillDir),
    fs.ensureDir(stackSkillDir),
    fs.ensureDir(handoffSkillDir),
    fs.ensureDir(contextSkillDir),
  ];
  if (ciEnabled) {
    dirPromises.push(fs.ensureDir(workflowsDir));
  }
  await Promise.all(dirPromises);

  const tx = new WriteTransaction(fs, workspaceRoot);
  const graphBlock = await buildGraphBlock(workspaceRoot);

  // Minimal copilot-instructions.md (always-on, ~400 tokens)
  await tx.write(
    path.join(githubDir, 'copilot-instructions.md'),
    generateIndex(story, contextSkillName, graphBlock),
  );

  // Skills — on-demand (loaded by description keyword match)
  for (const file of generateBaselineSkill(story)) {
    await tx.write(path.join(baselineSkillDir, file.filename), file.content);
  }
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
  await tx.write(path.join(handoffSkillDir, 'SKILL.md'), generateHandoffSkill(story));

  // Agents — on-select (loaded when user selects from dropdown)
  await tx.write(
    path.join(agentsDir, 'speckit-implementador.agent.md'),
    generateImplementadorAgent(story),
  );
  await tx.write(path.join(agentsDir, 'speckit-revisor.agent.md'), generateRevisorAgent(story));

  // Run prompt — monolithic mode (kept as prompt)
  await tx.write(path.join(promptsDir, 'run.prompt.md'), generateRunPrompt(story));

  // CI workflows (opt-in — skipped when ci === 'none')
  if (ciEnabled) {
    await tx.write(path.join(workflowsDir, 'quality-gate.yml'), generateCiQualityGate(story));
    await tx.write(path.join(workflowsDir, 'security-scan.yml'), generateCiSecurityScan());
  }

  // Corp-* skills (opt-in automático por detecção de stack; on-demand)
  const corpSkills = generateCorpSkills(story);
  for (const skill of corpSkills) {
    const dir = path.join(skillsDir, skill.name);
    await fs.ensureDir(dir);
    await tx.write(path.join(dir, 'SKILL.md'), skill.content);
  }

  return tx.commit();
}

async function buildGraphBlock(workspaceRoot: string): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('speckit.graph');
  if (!config.get<boolean>('enabled', true)) {
    return undefined;
  }
  if (config.get<string>('embed.mode', 'subgraph') === 'off') {
    return undefined;
  }

  const graph = await new GraphStore().load(workspaceRoot);
  if (graph === null) {
    return undefined;
  }

  const topN = config.get<number>('embed.topN', 20);
  const attributes = parseEmbedAttributes(config.get<unknown[]>('embed.attributes', []));
  return new SubgraphEmbedder(graph, new GraphQuery(graph)).generate({
    topN,
    attributes,
  });
}
