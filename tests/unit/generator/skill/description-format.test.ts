import { describe, expect, it } from 'vitest';
import { emptyStory } from '../../../../src/story/Story';
import { generateBaselineSkill } from '../../../../src/generator/skill/BaselineSkillGenerator';
import { generateStackSkill } from '../../../../src/generator/skill/StackSkillGenerator';
import { generateStoryContextSkill } from '../../../../src/generator/skill/StoryContextSkillGenerator';
import { generateFixContextSkill } from '../../../../src/generator/skill/FixContextSkillGenerator';
import { generateDevToolsSkill } from '../../../../src/generator/skill/DevToolsSkillGenerator';
import { generateHandoffSkill } from '../../../../src/generator/skill/HandoffSkillGenerator';
import { generateCorpSkills } from '../../../../src/generator/corp/CorpSkillsGenerator';

function getBaselineSkillMd(story?: Parameters<typeof generateBaselineSkill>[0]): string {
  const files = generateBaselineSkill(story);
  const md = files.find((f) => f.filename === 'SKILL.md');
  return md ? md.content : '';
}

function extractDescription(content: string): string | null {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const single = fm[1].match(/description:\s*"([^"]*)"/);
  if (single) return single[1];
  const multi = fm[1].match(/description:\s*>-\s*\n([\s\S]*?)(?:\n\w|\n---|$)/);
  return multi ? multi[1].replace(/\s+/g, ' ').trim() : null;
}

describe('skill description format — Use when / Use quando standard', () => {
  it('speckit-baseline description includes "Use when"', () => {
    const desc = extractDescription(getBaselineSkillMd());
    expect(desc).toBeTruthy();
    expect(desc).toMatch(/Use when/i);
    expect(desc).not.toMatch(/Activate when|Ative ao|Ative em|Ativado por/i);
  });

  it('speckit-stack description includes "Use when"', () => {
    const story = emptyStory();
    story.technicalSpec.language = 'java';
    story.technicalSpec.framework = 'springboot';
    const desc = extractDescription(
      generateStackSkill(
        { language: 'java', framework: 'springboot', infrastructure: 'aws', database: 'postgres' },
        story,
      ),
    );
    expect(desc).toBeTruthy();
    expect(desc).toMatch(/Use when/i);
    expect(desc).not.toMatch(/Activate when|Ative ao|Ative em|Ativado por/i);
  });

  it('speckit-story-context description includes "Use when"', () => {
    const story = emptyStory();
    story.metadata.id = 'STORY-001';
    const desc = extractDescription(generateStoryContextSkill(story));
    expect(desc).toBeTruthy();
    expect(desc).toMatch(/Use when/i);
    expect(desc).not.toMatch(/Activate when|Ative ao|Ative em|Ativado por/i);
  });

  it('speckit-fix-context description includes "Use when"', () => {
    const mockStack: Parameters<typeof generateFixContextSkill>[1] = {
      language: 'java',
      framework: 'springboot',
      target: 'backend',
      projectStage: 'brownfield',
      confidence: 'high',
      source: 'test',
    };
    const desc = extractDescription(
      generateFixContextSkill(
        {
          metadata: {
            id: 'FIX-001',
            title: 'sample',
            createdAt: '',
            version: 1,
            type: 'fix',
            status: 'open',
            gate: 0,
          },
          bugDescription: {
            title: '',
            symptoms: '',
            stepsToReproduce: [],
            environment: '',
            frequency: '',
          },
          rootCauseHypothesis: { hypothesis: '', suspectedFiles: [], suspectedComponents: [] },
          impactAssessment: {
            severity: '',
            affectedUsers: '',
            affectedSystems: [],
            regressionRisk: '',
          },
          regressionPrevention: { testsToAdd: [] },
          technicalContext: { messaging: '', database: '' },
          dof: { criteria: [] },
        },
        mockStack,
      ),
    );
    expect(desc).toBeTruthy();
    expect(desc).toMatch(/Use when/i);
    expect(desc).not.toMatch(/Activate when|Ative ao|Ative em|Ativado por/i);
  });

  it('speckit-handoff description includes "Use when"', () => {
    const desc = extractDescription(generateHandoffSkill());
    expect(desc).toBeTruthy();
    expect(desc).toMatch(/Use when/i);
    expect(desc).not.toMatch(/Activate when|Ative ao|Ative em|Ativado por/i);
  });

  it('devtools skill description includes "Use quando"', () => {
    const output = generateDevToolsSkill({
      language: 'typescript',
      framework: 'react',
      assessment: {
        eslint: false,
        prettier: false,
        husky: false,
        lintStaged: false,
        missing: ['ESLint'],
        present: [],
        conflicts: [],
        allPresent: false,
      },
    });
    expect(output).toMatch(/Use quando/i);
    expect(output).not.toMatch(/Ativado por keywords/i);
  });

  it('all corp-* skills descriptions include "Use quando"', () => {
    const story = emptyStory();
    story.technicalSpec.language = 'java';
    story.technicalSpec.framework = 'springboot';
    story.technicalSpec.database = 'mongodb';
    story.technicalSpec.infrastructure = 'aws sqs sns lambda';

    const skills = generateCorpSkills(story);
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      const desc = extractDescription(skill.content);
      expect(desc, `skill ${skill.name} should have description`).toBeTruthy();
      expect(desc, `skill ${skill.name} description should include 'Use quando'`).toMatch(
        /Use quando/i,
      );
      expect(
        desc,
        `skill ${skill.name} description should not contain legacy triggers`,
      ).not.toMatch(/Ative ao|Ative em|Ativado por/i);
    }
  });
});

describe('skill quick start sections', () => {
  it('speckit-baseline has ## Quick start at the top', () => {
    const content = getBaselineSkillMd();
    expect(content).toMatch(/^---[\s\S]+?---\s*\n+# SpecKit Baseline\s*\n+## Quick start/m);
  });

  it('speckit-stack has ## Quick start at the top', () => {
    const story = emptyStory();
    const content = generateStackSkill(
      { language: 'java', framework: 'springboot', infrastructure: 'aws', database: 'postgres' },
      story,
    );
    expect(content).toMatch(/^---[\s\S]+?---\s*\n+# SpecKit Stack[\s\S]*?## Quick start/m);
  });

  it('speckit-handoff has ## Quick start at the top', () => {
    const content = generateHandoffSkill();
    expect(content).toMatch(/^---[\s\S]+?---\s*\n+# SpecKit Handoff[\s\S]*?## Quick start/m);
  });

  it('speckit-baseline Quick start is concise (≤ 15 lines)', () => {
    const content = getBaselineSkillMd();
    const m = content.match(/## Quick start\n([\s\S]*?)(?=\n##|\n---)/);
    expect(m).toBeTruthy();
    const qsLines = (m![1] || '').split('\n').length;
    expect(qsLines).toBeLessThanOrEqual(15);
  });
});

describe('speckit-baseline split (progressive disclosure)', () => {
  const REQUIRED_REFERENCES = [
    'REFERENCE-testing.md',
    'REFERENCE-git.md',
    'REFERENCE-credentials.md',
    'REFERENCE-observability.md',
    'REFERENCE-security.md',
    'REFERENCE-idempotency.md',
  ];

  it('returns SKILL.md plus all REFERENCE-*.md files', () => {
    const files = generateBaselineSkill();
    const names = files.map((f) => f.filename).sort();
    expect(names).toEqual(['SKILL.md', ...REQUIRED_REFERENCES].sort());
  });

  it('SKILL.md contains the mandatory reading gate', () => {
    const content = getBaselineSkillMd();
    expect(content).toContain('# REGRA INEGOCIÁVEL — Pré-requisito de leitura');
    for (const ref of REQUIRED_REFERENCES) {
      expect(content).toContain(ref);
    }
  });

  it('SKILL.md keeps condensed credentials and idempotency rules always-on', () => {
    const content = getBaselineSkillMd();
    expect(content).toMatch(/Gestão de Credenciais — Regras Críticas/);
    expect(content).toMatch(/Idempotência — Regras Críticas/);
    expect(content).toContain('IAM roles');
    expect(content).toContain('Idempotency-Key');
  });

  it('every REFERENCE file has frontmatter and a back-pointer to the gate', () => {
    const files = generateBaselineSkill();
    for (const ref of REQUIRED_REFERENCES) {
      const file = files.find((f) => f.filename === ref);
      expect(file, `${ref} should be produced`).toBeTruthy();
      expect(file!.content).toMatch(/^---\n[\s\S]+?\n---/);
      expect(file!.content).toContain('REFERÊNCIA do speckit-baseline');
    }
  });

  it('SKILL.md is well under the legacy size (always-on token budget)', () => {
    const content = getBaselineSkillMd();
    expect(content.split('\n').length).toBeLessThanOrEqual(220);
    expect(content.length).toBeLessThan(15000);
  });
});

describe('speckit-handoff non-negotiables', () => {
  it('contains the anti-hallucination mandatory rule block', () => {
    const content = generateHandoffSkill();
    expect(content).toContain('REGRA INEGOCIÁVEL — Anti-alucinação no handoff');
    expect(content).toContain('[NÃO VERIFICADO]');
  });

  it('points handoff output to .speckit/handoff (not OS temp)', () => {
    const content = generateHandoffSkill();
    expect(content).toContain('.speckit/handoff/');
    expect(content).not.toMatch(/\bOS temp\b.*save/i);
  });

  it('embeds redaction rules referencing baseline credentials', () => {
    const content = generateHandoffSkill();
    expect(content).toMatch(/Redaction rules/);
    expect(content).toMatch(/REFERENCE-credentials\.md|speckit-baseline/);
  });

  it('lists a Suggested skills section for the next agent', () => {
    const content = generateHandoffSkill();
    expect(content).toMatch(/## Suggested skills/);
  });
});
