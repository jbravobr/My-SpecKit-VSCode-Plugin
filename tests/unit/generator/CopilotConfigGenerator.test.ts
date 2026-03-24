import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseStory } from '../../../src/story/StoryParser';
import { generateCopilotConfig } from '../../../src/generator/CopilotConfigGenerator';
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

  it('always writes all 9 baseline instruction files', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const baselineFiles = [
      '00-agent-integrity',
      '01-performance',
      '02-architecture',
      '03-context-management',
      '04-testing-standards',
      '05-git-workflow',
      '06-credential-security',
      '07-observability',
      '08-security-tests',
    ];
    baselineFiles.forEach(name => expect(fs.hasFile(name)).toBe(true));
  });

  it('always writes 3 story-context instruction files', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    ['10-business-context', '11-functional-spec', '12-nonfunctional-spec'].forEach(name =>
      expect(fs.hasFile(name)).toBe(true),
    );
  });

  it('always writes 3 prompt files', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    ['run.prompt', 'implement.prompt', 'review.prompt'].forEach(name =>
      expect(fs.hasFile(name)).toBe(true),
    );
  });

  it('returned paths use forward slashes only', async () => {
    const fs = new InMemoryFileSystem();
    const files = await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(files.every(f => !f.includes('\\'))).toBe(true);
  });
});

describe('generateCopilotConfig — language and framework selection', () => {
  it('writes lang-typescript for typescript story', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.hasFile('lang-typescript')).toBe(true);
  });

  it('writes fw-react for react story', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.hasFile('fw-react')).toBe(true);
  });

  it('writes lang-java for java story', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.hasFile('lang-java')).toBe(true);
  });

  it('writes fw-springboot for springboot story', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.hasFile('fw-springboot')).toBe(true);
  });

  it('omits language file when language is empty', async () => {
    const story = { ...loadStory('story-complete.md'), technicalSpec: { ...loadStory('story-complete.md').technicalSpec, language: '' as const } };
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, story, fs);
    expect(fs.hasFile('lang-')).toBe(false);
  });
});

describe('generateCopilotConfig — infra-kafka trigger', () => {
  it('writes infra-kafka when infrastructure contains "kafka"', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.hasFile('infra-kafka')).toBe(true);
  });

  it('does NOT write infra-kafka when infrastructure is NA', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.hasFile('infra-kafka')).toBe(false);
  });

  it('kafka instruction contains Consumer and Producer sections', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    const content = fs.contentFor('infra-kafka');
    expect(content).toContain('Consumer');
    expect(content).toContain('Producer');
    expect(content).toContain('DLQ');
  });
});

describe('generateCopilotConfig — infra-aws trigger', () => {
  it('writes infra-aws when database contains "Aurora MySQL"', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.hasFile('infra-aws')).toBe(true);
  });

  it('does NOT write infra-aws when database is NA', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    expect(fs.hasFile('infra-aws')).toBe(false);
  });

  it('aws instruction contains DynamoDB and RDS sections', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    const content = fs.contentFor('infra-aws');
    expect(content).toContain('DynamoDB');
    expect(content).toContain('RDS Aurora');
  });
});

describe('generateCopilotConfig — infra-glue trigger', () => {
  it('writes infra-glue when infrastructure contains "glue"', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-glue.md'), fs);
    expect(fs.hasFile('infra-glue')).toBe(true);
  });

  it('does NOT write infra-glue for non-glue python story', async () => {
    const story = loadStory('story-complete.md');
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, story, fs);
    expect(fs.hasFile('infra-glue')).toBe(false);
  });
});

describe('generateCopilotConfig — pattern-crud trigger', () => {
  it('writes pattern-crud for backend target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.hasFile('pattern-crud')).toBe(true);
  });

  it('writes pattern-crud for bff target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    expect(fs.hasFile('pattern-crud')).toBe(true);
  });

  it('does NOT write pattern-crud for frontend target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.hasFile('pattern-crud')).toBe(false);
  });

  it('crud instruction contains Repository and RFC 7807 sections', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    const content = fs.contentFor('pattern-crud');
    expect(content).toContain('Repository');
    expect(content).toContain('RFC 7807');
    expect(content).toContain('Paginação');
  });
});

describe('generateCopilotConfig — pattern-bff trigger', () => {
  it('writes pattern-bff for bff target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    expect(fs.hasFile('pattern-bff')).toBe(true);
  });

  it('does NOT write pattern-bff for backend target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.hasFile('pattern-bff')).toBe(false);
  });

  it('bff instruction contains Circuit Breaker and Token Relay sections', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    const content = fs.contentFor('pattern-bff');
    expect(content).toContain('Circuit Breaker');
    expect(content).toContain('Token Relay');
  });
});

describe('generateCopilotConfig — new baseline generators', () => {
  it('credential-security instruction covers IAM roles', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('06-credential-security');
    expect(content).toContain('IAM roles');
    expect(content).toContain('Instance Profile');
  });

  it('observability instruction covers health checks and traceId', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('07-observability');
    expect(content).toContain('health');
    expect(content).toContain('traceId');
  });

  it('security-tests instruction covers 401 and mass assignment', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('08-security-tests');
    expect(content).toContain('401');
    expect(content).toContain('Mass Assignment');
  });
});

describe('generateCopilotConfig — pattern-contract-testing trigger', () => {
  it('writes pattern-contract-testing for bff target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    expect(fs.hasFile('pattern-contract-testing')).toBe(true);
  });

  it('does NOT write pattern-contract-testing for backend target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.hasFile('pattern-contract-testing')).toBe(false);
  });

  it('contract-testing instruction contains WireMock and Pact', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    const content = fs.contentFor('pattern-contract-testing');
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
});

describe('generateCopilotConfig — pattern-idempotency trigger', () => {
  it('writes pattern-idempotency for backend target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    expect(fs.hasFile('pattern-idempotency')).toBe(true);
  });

  it('writes pattern-idempotency for bff target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-bff.md'), fs);
    expect(fs.hasFile('pattern-idempotency')).toBe(true);
  });

  it('does NOT write pattern-idempotency for frontend target', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.hasFile('pattern-idempotency')).toBe(false);
  });

  it('idempotency instruction covers Idempotency-Key and POST', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-java-kafka-aws.md'), fs);
    const content = fs.contentFor('pattern-idempotency');
    expect(content).toContain('Idempotency-Key');
    expect(content).toContain('POST');
  });
});

describe('generateCopilotConfig — parametrized generators', () => {
  it('observability instruction uses story availability SLO', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('07-observability');
    // story-complete has availability NFR "99,9% uptime..."
    expect(content).toContain('uptime');
  });

  it('observability instruction includes consumer_lag monitoring', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('07-observability')).toContain('consumer_lag');
  });

  it('testing-standards includes acceptance criteria section from story', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('04-testing-standards')).toContain('Cenários mínimos obrigatórios derivados');
  });

  it('testing-standards includes performance test section for story with latency NFR', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('04-testing-standards');
    expect(content).toContain('P99');
    expect(content).toContain('k6');
  });
});

describe('generateCopilotConfig — content correctness', () => {
  it('copilot-instructions.md contains the story title', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('copilot-instructions.md')).toContain('Autenticação via OAuth2 com GitHub');
  });

  it('10-business-context includes the problem statement', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('10-business-context')).toContain('fricção no onboarding');
  });

  it('14-architecture-pattern contains Hexagonal', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    expect(fs.contentFor('14-architecture-pattern')).toContain('Hexagonal');
  });

  it('implement.prompt.md contains Gate markers', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('implement.prompt');
    expect(content).toContain('Gate 1');
    expect(content).toContain('Gate 2');
  });

  it('review.prompt.md contains Gate markers and DoD criteria', async () => {
    const fs = new InMemoryFileSystem();
    await generateCopilotConfig(root, loadStory('story-complete.md'), fs);
    const content = fs.contentFor('review.prompt');
    expect(content).toContain('Gate 3');
    expect(content).toContain('Gate 4');
    expect(content).toContain('Todos os critérios de aceite validados por testes automatizados');
  });
});
