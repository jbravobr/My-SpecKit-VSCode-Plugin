import { NonFunctionalSpec, Story } from '../../story/Story';
import { generateAgentIntegrity } from '../baseline/AgentIntegrityGenerator';
import { generateArchitecture } from '../baseline/ArchitectureGenerator';
import { generateContextManagement } from '../baseline/ContextManagementGenerator';
import { generateCredentialSecurity } from '../baseline/CredentialSecurityGenerator';
import { generateGitWorkflow } from '../baseline/GitWorkflowGenerator';
import { generateIdempotency } from '../baseline/IdempotencyGenerator';
import { generateObservability } from '../baseline/ObservabilityGenerator';
import { generatePerformance } from '../baseline/PerformanceGenerator';
import { generateSecurityTests } from '../baseline/SecurityTestsGenerator';
import { generateTestingStandards } from '../baseline/TestingStandardsGenerator';
import { stripFrontmatter } from './stripFrontmatter';

export function generateBaselineSkill(story?: Story): string {
  const nfr: NonFunctionalSpec | undefined = story?.nonFunctionalSpec;

  const sections = [
    stripFrontmatter(generateAgentIntegrity()),
    stripFrontmatter(generatePerformance(nfr)),
    stripFrontmatter(generateArchitecture()),
    stripFrontmatter(generateContextManagement()),
    stripFrontmatter(generateTestingStandards(story)),
    stripFrontmatter(generateGitWorkflow()),
    stripFrontmatter(generateCredentialSecurity()),
    stripFrontmatter(generateObservability(nfr)),
    stripFrontmatter(generateSecurityTests()),
    stripFrontmatter(generateIdempotency()),
  ];

  return `---
name: speckit-baseline
description: "SpecKit engineering baseline — agent integrity, performance, architecture, testing standards (≥80% coverage), git workflow, credential security, observability, security tests, idempotency. Activate when implementing, reviewing, or testing code in a SpecKit-managed project."
---

${sections.join('\n---\n\n')}
`;
}
