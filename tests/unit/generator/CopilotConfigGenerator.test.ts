import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { generateCopilotConfig } from '../../../src/generator/CopilotConfigGenerator';
import { parseStory } from '../../../src/story/StoryParser';
import { InMemoryFileSystem } from '../../support/fakes';

const fixturesDir = resolve(__dirname, '../../fixtures');

function loadStory(filename: string) {
  return parseStory(readFileSync(resolve(fixturesDir, filename), 'utf-8'));
}

const root = '/fake-workspace';

describe('generateCopilotConfig — baseline output', () => {
  it('always writes copilot-instructions.md', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.hasFile('copilot-instructions.md')).toBe(true);
  });

  it('always writes speckit-baseline skill', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.hasFile('speckit-baseline/SKILL.md')).toBe(true);
    const content = fs.contentFor('speckit-baseline/SKILL.md')!;
    expect(content).toContain('Agent Integrity');
    expect(content).toContain('Performance');
    expect(content).toContain('Architecture');
    expect(content).toContain('Context Management');
    expect(content).toContain('Testing');
    expect(content).toContain('Git Workflow');
    expect(content).toContain('Credenciais');
    expect(content).toContain('Observabilidade');
    expect(content).toContain('Segurança');
  });

  it('always writes speckit context skill namespaced by story ID', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.hasFile('speckit-context-STORY-001/SKILL.md')).toBe(true);
  });

  it('always writes agents and run prompt', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.hasFile('speckit-implementador.agent.md')).toBe(true);
    expect(fs.hasFile('speckit-revisor.agent.md')).toBe(true);
    expect(fs.hasFile('run.prompt')).toBe(true);
  });

  it('returned paths use forward slashes only', async () => {
    const fs = new InMemoryFileSystem();
    const files = await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(files.every((f) => !f.includes('\\'))).toBe(true);
  });

  it('different story IDs produce distinct context skill folders', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs); // id: 001
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs); // id: 002

    expect(fs.hasFile('speckit-context-STORY-001/SKILL.md')).toBe(true);
    expect(fs.hasFile('speckit-context-STORY-002/SKILL.md')).toBe(true);
  });

  it('copilot-instructions.md references the namespaced context skill', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('copilot-instructions.md')!;
    expect(content).toContain('speckit-context-STORY-001');
    expect(content).not.toContain('speckit-story-context');
  });
});

describe('generateCopilotConfig — language and framework selection', () => {
  it('stack skill contains TypeScript conventions for typescript story', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.hasFile('speckit-stack/SKILL.md')).toBe(true);
    expect(fs.contentFor('speckit-stack/SKILL.md')).toContain('TypeScript');
  });

  it('stack skill contains React conventions for react story', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).toContain('React');
  });

  it('stack skill contains Java conventions for java story', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).toContain('Java');
  });

  it('stack skill contains Spring Boot conventions for springboot story', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).toContain('Spring Boot');
  });

  it('omits language file when language is empty', async () => {
    const story = {
      ...loadStory('story-complete.md'),
      technicalSpec: { ...loadStory('story-complete.md').technicalSpec, language: '' as const },
    };
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, story, fs);
    expect(fs.hasFile('lang-')).toBe(false);
  });
});

describe('generateCopilotConfig — infra-kafka trigger', () => {
  it('stack skill contains Kafka content when infrastructure contains "kafka"', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).toContain('Kafka');
  });

  it('stack skill omits Kafka when infrastructure is NA', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).not.toContain('Kafka');
  });

  it('kafka content contains Consumer and Producer sections', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    const content = fs.contentFor('speckit-stack/SKILL.md')!;
    expect(content).toContain('Consumer');
    expect(content).toContain('Producer');
    expect(content).toContain('DLQ');
  });
});

describe('generateCopilotConfig — infra-aws trigger', () => {
  it('stack skill contains AWS content when database contains "Aurora MySQL"', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).toContain('AWS');
  });

  it('stack skill omits AWS infra section when database is NA', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    // The AWS generator adds a "## DynamoDB" heading; its absence proves infra-aws was not included
    expect(fs.contentFor('speckit-stack/SKILL.md')).not.toContain('## DynamoDB');
  });

  it('aws content contains DynamoDB and RDS sections', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    const content = fs.contentFor('speckit-stack/SKILL.md')!;
    expect(content).toContain('DynamoDB');
    expect(content).toContain('RDS Aurora');
  });
});

describe('generateCopilotConfig — infra-glue trigger', () => {
  it('stack skill contains Glue content when infrastructure contains "glue"', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-glue.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).toContain('Glue');
  });

  it('stack skill omits Glue for non-glue story', async () => {
    const story = loadStory('story-complete.md');
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, story, fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).not.toContain('GlueJob');
  });
});

describe('generateCopilotConfig — pattern-crud trigger', () => {
  it('stack skill contains CRUD content for backend target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).toContain('CRUD');
  });

  it('stack skill contains CRUD content for bff target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).toContain('CRUD');
  });

  it('stack skill omits CRUD for frontend target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).not.toContain('CRUD');
  });

  it('crud content contains Repository and RFC 7807 sections', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    const content = fs.contentFor('speckit-stack/SKILL.md')!;
    expect(content).toContain('Repository');
    expect(content).toContain('RFC 7807');
    expect(content).toContain('Paginação');
  });
});

describe('generateCopilotConfig — pattern-bff trigger', () => {
  it('stack skill contains BFF content for bff target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).toContain('BFF');
  });

  it('stack skill omits BFF for backend target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).not.toContain('Backend for Frontend');
  });

  it('bff content contains Circuit Breaker and Token Relay sections', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    const content = fs.contentFor('speckit-stack/SKILL.md')!;
    expect(content).toContain('Circuit Breaker');
    expect(content).toContain('Token Relay');
  });
});

describe('generateCopilotConfig — new baseline generators', () => {
  it('baseline skill contains credential-security with IAM roles', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('speckit-baseline/SKILL.md')!;
    expect(content).toContain('IAM roles');
    expect(content).toContain('Instance Profile');
  });

  it('baseline skill contains observability with health checks and traceId', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('speckit-baseline/SKILL.md')!;
    expect(content).toContain('health');
    expect(content).toContain('traceId');
  });

  it('baseline skill contains security-tests with 401 and mass assignment', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('speckit-baseline/SKILL.md')!;
    expect(content).toContain('401');
    expect(content).toContain('Mass Assignment');
  });
});

describe('generateCopilotConfig — pattern-contract-testing trigger', () => {
  it('stack skill contains contract-testing for bff target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).toContain('Contract');
  });

  it('stack skill omits contract-testing for backend target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).not.toContain('Pact');
  });

  it('contract-testing content contains WireMock and Pact', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    const content = fs.contentFor('speckit-stack/SKILL.md')!;
    expect(content).toContain('WireMock');
    expect(content).toContain('Pact');
  });
});

describe('generateCopilotConfig — CI workflows', () => {
  it('writes quality-gate.yml workflow', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.hasFile('quality-gate.yml')).toBe(true);
  });

  it('writes security-scan.yml workflow', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.hasFile('security-scan.yml')).toBe(true);
  });

  it('quality-gate.yml uses vitest for typescript story', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('quality-gate.yml')).toContain('vitest');
  });

  it('quality-gate.yml uses maven for java story', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.contentFor('quality-gate.yml')).toContain('mvnw');
  });

  it('security-scan.yml includes trufflehog and semgrep', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('security-scan.yml');
    expect(content).toContain('trufflehog');
    expect(content).toContain('semgrep');
  });

  it('skips quality-gate.yml when ci is none', async () => {
    const fs = new InMemoryFileSystem();
    const story = loadStory('story-complete.md');
    story.technicalSpec.ci = 'none';
    await generateCopilotConfig(root, story, fs);
    expect(fs.hasFile('quality-gate.yml')).toBe(false);
  });

  it('skips security-scan.yml when ci is none', async () => {
    const fs = new InMemoryFileSystem();
    const story = loadStory('story-complete.md');
    story.technicalSpec.ci = 'none';
    await generateCopilotConfig(root, story, fs);
    expect(fs.hasFile('security-scan.yml')).toBe(false);
  });

  it('generates CI workflows when ci is empty (backwards compat)', async () => {
    const fs = new InMemoryFileSystem();
    const story = loadStory('story-partial.md');
    await generateCopilotConfig(root, story, fs);
    expect(fs.hasFile('quality-gate.yml')).toBe(true);
    expect(fs.hasFile('security-scan.yml')).toBe(true);
  });
});

describe('generateCopilotConfig — pattern-idempotency trigger', () => {
  it('stack skill contains idempotency for backend target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).toContain('Idempot');
  });

  it('stack skill contains idempotency for bff target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).toContain('Idempot');
  });

  it('stack skill omits idempotency for frontend target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('speckit-stack/SKILL.md')).not.toContain('Idempotency-Key');
  });

  it('idempotency content covers Idempotency-Key and POST', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    const content = fs.contentFor('speckit-stack/SKILL.md')!;
    expect(content).toContain('Idempotency-Key');
    expect(content).toContain('POST');
  });
});

describe('generateCopilotConfig — parametrized generators', () => {
  it('baseline skill uses story availability SLO in observability', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('speckit-baseline/SKILL.md')!;
    // story-complete has availability NFR "99,9% uptime..."
    expect(content).toContain('uptime');
  });

  it('baseline skill includes consumer_lag monitoring', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('speckit-baseline/SKILL.md')).toContain('consumer_lag');
  });

  it('baseline skill includes acceptance criteria section from story', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('speckit-baseline/SKILL.md')).toContain(
      'Cenários mínimos obrigatórios derivados',
    );
  });

  it('baseline skill includes performance test section for story with latency NFR', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('speckit-baseline/SKILL.md')!;
    expect(content).toContain('P99');
    expect(content).toContain('k6');
  });
});

describe('generateCopilotConfig — content correctness', () => {
  it('copilot-instructions.md contains the story title', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('copilot-instructions.md')).toContain(
      'Autenticação via OAuth2 com GitHub',
    );
  });

  it('story-context skill includes the problem statement', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('speckit-context-STORY-001/SKILL.md')).toContain('fricção no onboarding');
  });

  it('story-context skill contains Hexagonal', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('speckit-context-STORY-001/SKILL.md')).toContain('Hexagonal');
  });

  it('implementador agent contains Gate markers', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('speckit-implementador.agent.md')!;
    expect(content).toContain('Gate 1');
    expect(content).toContain('Gate 2');
  });

  it('revisor agent contains Gate markers and DoD criteria', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('speckit-revisor.agent.md')!;
    expect(content).toContain('Gate 3');
    expect(content).toContain('Gate 4');
    expect(content).toContain('Todos os critérios de aceite validados por testes automatizados');
  });

  it('implementador agent shows brownfield guidance by default', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('speckit-implementador.agent.md')!;
    expect(content).toContain('brownfield');
    expect(content).toContain('convenções');
  });

  it('implementador agent shows greenfield scaffolding when projectStage is greenfield', async () => {
    const fs = new InMemoryFileSystem();
    const story = loadStory('story-complete.md');
    story.technicalSpec.projectStage = 'greenfield';
    await generateCopilotConfig(root, story, fs);
    const content = fs.contentFor('speckit-implementador.agent.md')!;
    expect(content).toContain('greenfield');
    expect(content).toContain('Scaffolding');
  });

  it('agents do NOT contain tool-setup or tool-discovery instructions', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const implContent = fs.contentFor('speckit-implementador.agent.md')!;
    const revContent = fs.contentFor('speckit-revisor.agent.md')!;
    for (const content of [implContent, revContent]) {
      expect(content).not.toContain('PRÉ-REQUISITO OBRIGATÓRIO');
      expect(content).not.toContain('REGRA ZERO');
      expect(content).not.toContain('REGRA DE EXECUÇÃO');
      expect(content).not.toContain('habilitar ferramentas');
      expect(content).not.toContain('tool_search_tool_regex');
      expect(content).not.toContain('carregadas sob demanda');
      expect(content).not.toContain('tools: ["*"]');
      expect(content).toContain('read/readFile');
      expect(content).toContain('execute/runInTerminal');
      expect(content).toContain('search/codebase');
    }
  });

  it('revisor agent requires user confirmation before corrections', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const revContent = fs.contentFor('speckit-revisor.agent.md')!;
    expect(revContent).toContain('NUNCA implemente correções sem aprovação explícita do usuário');
    expect(revContent).toContain('GATE DE CONFIRMAÇÃO');
    expect(revContent).toContain('AGUARDE aprovação explícita do usuário');
  });
});

describe('generateCopilotConfig — transactional write with rollback', () => {
  it('rolls back all written files when any single write fails', async () => {
    const fs = new InMemoryFileSystem();
    let callCount = 0;
    const originalWrite = fs.writeFile.bind(fs);
    fs.writeFile = async (filePath: string, content: string) => {
      callCount++;
      // Fail the second write only
      if (callCount === 2) {
        throw new Error('simulated disk error');
      }
      return originalWrite(filePath, content);
    };

    await expect(generateCopilotConfig(root, loadStory('story-complete.md'), fs)).rejects.toThrow(
      'rollback executado',
    );

    // After rollback, no generated files should remain (first file was rolled back)
    const remaining = fs.writtenPaths().filter((p) => p.includes('.github/'));
    expect(remaining.length).toBe(0);
  });

  it('throws when ALL writes fail', async () => {
    const fs = new InMemoryFileSystem();
    fs.writeFile = async () => {
      throw new Error('total failure');
    };

    await expect(generateCopilotConfig(root, loadStory('story-complete.md'), fs)).rejects.toThrow(
      'Falha ao gravar arquivos',
    );
  });
});
