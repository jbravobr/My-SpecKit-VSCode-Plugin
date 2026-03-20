import { describe, it, expect } from 'vitest';
import { generateAgentIntegrity } from '../../../../src/generator/baseline/AgentIntegrityGenerator';
import { generatePerformance } from '../../../../src/generator/baseline/PerformanceGenerator';
import { generateArchitecture } from '../../../../src/generator/baseline/ArchitectureGenerator';
import { generateContextManagement } from '../../../../src/generator/baseline/ContextManagementGenerator';
import { generateTestingStandards } from '../../../../src/generator/baseline/TestingStandardsGenerator';
import { generateGitWorkflow } from '../../../../src/generator/baseline/GitWorkflowGenerator';

const generators = [
  { name: 'AgentIntegrity', fn: generateAgentIntegrity },
  { name: 'Performance', fn: generatePerformance },
  { name: 'Architecture', fn: generateArchitecture },
  { name: 'ContextManagement', fn: generateContextManagement },
  { name: 'TestingStandards', fn: generateTestingStandards },
  { name: 'GitWorkflow', fn: generateGitWorkflow },
];

describe('baseline generators', () => {
  generators.forEach(({ name, fn }) => {
    it(`${name}: returns non-empty string`, () => {
      const result = fn();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it(`${name}: contains applyTo frontmatter`, () => {
      const result = fn();
      expect(result).toContain('applyTo');
    });
  });
});
