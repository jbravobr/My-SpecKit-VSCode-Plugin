import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { generateAgentIntegrity } from '../../../../src/generator/baseline/AgentIntegrityGenerator';
import { generateArchitecture } from '../../../../src/generator/baseline/ArchitectureGenerator';
import { generateContextManagement } from '../../../../src/generator/baseline/ContextManagementGenerator';
import { generateGitWorkflow } from '../../../../src/generator/baseline/GitWorkflowGenerator';
import { generateObservability } from '../../../../src/generator/baseline/ObservabilityGenerator';
import { generatePerformance } from '../../../../src/generator/baseline/PerformanceGenerator';
import { generateTestingStandards } from '../../../../src/generator/baseline/TestingStandardsGenerator';
import { parseStory } from '../../../../src/story/StoryParser';

const fixturesDir = resolve(__dirname, '../../../fixtures');
function loadStory(filename: string) {
  return parseStory(readFileSync(resolve(fixturesDir, filename), 'utf-8'));
}

const staticGenerators = [
  { name: 'AgentIntegrity', fn: generateAgentIntegrity },
  { name: 'Performance', fn: generatePerformance },
  { name: 'Architecture', fn: generateArchitecture },
  { name: 'ContextManagement', fn: generateContextManagement },
  { name: 'GitWorkflow', fn: generateGitWorkflow },
];

describe('baseline static generators', () => {
  staticGenerators.forEach(({ name, fn }) => {
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

  it('AgentIntegrity: enforces 80% coverage gate', () => {
    expect(generateAgentIntegrity()).toContain('80%');
  });

  it('Performance: covers Big-O and parallel async', () => {
    const result = generatePerformance();
    expect(result).toContain('Big-O');
    expect(result).toContain('Promise.all');
  });

  it('Architecture: covers SOLID and hexagonal', () => {
    const result = generateArchitecture();
    expect(result).toContain('SOLID');
    expect(result).toContain('hexagonal');
  });

  it('Architecture: covers HTTP client resilience with timeout and retry', () => {
    const result = generateArchitecture();
    expect(result).toContain('Timeout');
    expect(result).toContain('Retry');
    expect(result).toContain('Circuit Breaker');
  });

  it('Architecture: covers traceparent propagation for outbound HTTP', () => {
    expect(generateArchitecture()).toContain('traceparent');
  });

  it('ContextManagement: covers anti-hallucination guidance', () => {
    expect(generateContextManagement()).toContain('Anti-alucinação');
  });

  it('GitWorkflow: covers Conventional Commits and feature branch', () => {
    const result = generateGitWorkflow();
    expect(result).toContain('Conventional Commits');
    expect(result).toContain('feature/');
  });

  it('GitWorkflow: covers git init recovery when workspace is not a repository', () => {
    const result = generateGitWorkflow();
    expect(result).toContain('Pré-flight Git obrigatório');
    expect(result).toContain('git rev-parse --is-inside-work-tree');
    expect(result).toContain('not a git repository');
    expect(result).toContain('git init');
    expect(result).toContain('repita exatamente o mesmo `git add` e `git commit` uma única vez');
  });
});

describe('TestingStandardsGenerator', () => {
  it('returns non-empty string without story', () => {
    const result = generateTestingStandards();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains applyTo frontmatter', () => {
    expect(generateTestingStandards()).toContain('applyTo');
  });

  it('covers 80% threshold, AAA and mock guidance', () => {
    const result = generateTestingStandards();
    expect(result).toContain('80%');
    expect(result).toContain('Arrange');
    expect(result).toContain('mock');
  });

  it('includes Testcontainers preflight with Podman fallback', () => {
    const result = generateTestingStandards();
    expect(result).toContain('Pré-flight para Testcontainers');
    expect(result).toContain('docker info');
    expect(result).toContain('podman machine start');
    expect(result).toContain('podman info');
  });

  it('includes acceptance criteria section when story has criteria', () => {
    const story = loadStory('story-complete.md');
    const result = generateTestingStandards(story);
    expect(result).toContain('Cenários mínimos obrigatórios derivados');
  });

  it('includes performance test section when story has latency NFR', () => {
    const story = loadStory('story-complete.md');
    const result = generateTestingStandards(story);
    // story-complete has P99 < 200ms NFR
    expect(result).toContain('performance');
    expect(result).toContain('P99');
  });

  it('emits performance test section with default label when story has no performance NFR', () => {
    const story = loadStory('story-complete.md');
    const noPerf = { ...story, nonFunctionalSpec: { ...story.nonFunctionalSpec, performance: '' } };
    const result = generateTestingStandards(noPerf);
    expect(result).toContain('Teste de performance');
    expect(result).toContain('baseline padrão');
    expect(result).toContain('P99 < 500ms');
  });

  it('omits acceptance criteria section when story has none', () => {
    const story = loadStory('story-complete.md');
    const noCriteria = {
      ...story,
      functionalSpec: { ...story.functionalSpec, acceptanceCriteria: [] },
    };
    expect(generateTestingStandards(noCriteria)).not.toContain(
      'Cenários mínimos obrigatórios derivados',
    );
  });
});

describe('PerformanceGenerator', () => {
  it('uses default P99 and availability when nfr is not provided', () => {
    const result = generatePerformance();
    expect(result).toContain('P99 < 500ms');
    expect(result).toContain('99,9%');
  });

  it('emits default note when no NFR is declared', () => {
    const result = generatePerformance();
    expect(result).toContain('Nenhum NFR de performance declarado');
  });

  it('uses story P99 when performance NFR is declared', () => {
    const story = loadStory('story-complete.md');
    const result = generatePerformance(story.nonFunctionalSpec);
    expect(result).toContain('P99 < 200ms');
  });

  it('does not emit default note when story NFR is declared', () => {
    const story = loadStory('story-complete.md');
    const result = generatePerformance(story.nonFunctionalSpec);
    expect(result).not.toContain('Nenhum NFR de performance declarado');
  });
});

describe('ObservabilityGenerator', () => {
  it('returns non-empty string without nfr', () => {
    const result = generateObservability();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains applyTo frontmatter', () => {
    expect(generateObservability()).toContain('applyTo');
  });

  it('uses default SLOs when nfr is not provided', () => {
    const result = generateObservability();
    expect(result).toContain('99,9%');
    expect(result).toContain('P99 < 500ms');
  });

  it('uses story NFR values for SLOs when provided', () => {
    const story = loadStory('story-complete.md');
    const result = generateObservability(story.nonFunctionalSpec);
    // story-complete has "P99 < 200ms" performance and "99.9% uptime" availability
    expect(result).toContain('P99 < 200ms');
  });

  it('covers health check, traceId, structured logging', () => {
    const result = generateObservability();
    expect(result).toContain('health');
    expect(result).toContain('traceId');
    expect(result).toContain('JSON');
  });

  it('covers Kafka consumer lag monitoring', () => {
    expect(generateObservability()).toContain('consumer_lag');
  });

  it('covers batch job traceId guidance', () => {
    expect(generateObservability()).toContain('batch');
  });
});
