import { Story } from '../../story/Story';
import { generateArchPattern } from '../story/ArchPatternGenerator';
import { generateBusinessContext } from '../story/BusinessContextGenerator';
import { generateDod } from '../story/DodGenerator';
import { generateFunctionalSpec } from '../story/FunctionalSpecGenerator';
import { generateNonFunctional } from '../story/NonFunctionalGenerator';
import { generateTechStack } from '../story/TechStackGenerator';
import { stripFrontmatter } from './stripFrontmatter';

export function generateStoryContextSkill(story: Story): string {
  const storyId = story.metadata.id || '001';

  const sections = [
    stripFrontmatter(generateBusinessContext(story)),
    stripFrontmatter(generateFunctionalSpec(story)),
    stripFrontmatter(generateNonFunctional(story)),
    stripFrontmatter(generateTechStack(story)),
    stripFrontmatter(generateArchPattern(story)),
    stripFrontmatter(generateDod(story)),
  ];

  return `---
name: speckit-story-context
description: "SpecKit story ${storyId} context — business requirement, functional spec with acceptance criteria, non-functional requirements, tech stack, architecture pattern, and definition of done. Activate when implementing or reviewing story ${storyId}."
---

${sections.join('\n---\n\n')}
`;
}
