import { Fix, TechStackDetection } from '../../fix/Fix';
import { generateGraphMandateCondensed } from '../baseline/GraphNavigationGenerator';
import { generateFixContext } from '../fix/FixContextGenerator';
import { generateFixDof } from '../fix/FixDofGenerator';
import { generateImpact } from '../fix/ImpactGenerator';
import { generateRegression } from '../fix/RegressionGenerator';
import { generateRootCause } from '../fix/RootCauseGenerator';
import { stripFrontmatter } from './stripFrontmatter';

export function generateFixContextSkill(fix: Fix, _stack: TechStackDetection): string {
  const fixId = fix.metadata.id || '001';

  const sections = [
    stripFrontmatter(generateFixContext(fix)),
    stripFrontmatter(generateRootCause(fix)),
    stripFrontmatter(generateImpact(fix)),
    stripFrontmatter(generateRegression(fix)),
    stripFrontmatter(generateFixDof(fix)),
  ];

  return `---
name: speckit-fix-context
description: "SpecKit fix ${fixId} context — bug description, root cause analysis, impact assessment, regression prevention, and definition of fix. Use when implementing or reviewing fix ${fixId}."
---

${sections.join('\n---\n\n')}

---

${generateGraphMandateCondensed()}
`;
}
