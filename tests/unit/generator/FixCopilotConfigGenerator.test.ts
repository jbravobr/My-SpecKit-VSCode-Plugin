import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFix } from '../../../src/fix/FixParser';
import { generateFixCopilotConfig } from '../../../src/generator/FixCopilotConfigGenerator';
import { InMemoryFileSystem, WorkspaceStub } from '../../support/fakes';
import { TechStackDetection } from '../../../src/fix/Fix';

const fixturesDir = resolve(__dirname, '../../fixtures');

function loadFix(filename: string) {
  return parseFix(readFileSync(resolve(fixturesDir, filename), 'utf-8'));
}

const root = '/fake-workspace';

const tsReactFrontend: TechStackDetection = {
  language: 'typescript',
  framework: 'react',
  target: 'frontend',
  confidence: 'high',
  source: 'package.json',
};

const javaSpringBackend: TechStackDetection = {
  language: 'java',
  framework: 'springboot',
  target: 'backend',
  confidence: 'high',
  source: 'pom.xml',
};

const tsBffStack: TechStackDetection = {
  language: 'typescript',
  framework: 'react',
  target: 'bff',
  confidence: 'high',
  source: 'package.json',
};

describe('generateFixCopilotConfig — baseline output', () => {
  it('always writes copilot-instructions.md', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(fs.hasFile('copilot-instructions.md')).toBe(true);
  });

  it('always writes all 9 baseline instruction files', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
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

  it('always writes all 5 fix-context instruction files', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    ['10-fix-context', '11-root-cause', '12-fix-impact', '13-regression-prevention', '14-fix-dof'].forEach(name =>
      expect(fs.hasFile(name)).toBe(true),
    );
  });

  it('always writes 3 fix prompt files', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    ['fix-run.prompt', 'fix-implement.prompt', 'fix-review.prompt'].forEach(name =>
      expect(fs.hasFile(name)).toBe(true),
    );
  });

  it('does NOT write CI workflow files', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(fs.hasFile('quality-gate.yml')).toBe(false);
    expect(fs.hasFile('security-scan.yml')).toBe(false);
  });

  it('returned paths use forward slashes only', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    const files = await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(files.every(f => !f.includes('\\'))).toBe(true);
  });
});

describe('generateFixCopilotConfig — language selection (auto-detected via workspace)', () => {
  it('writes lang-typescript when workspace detects typescript', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(fs.hasFile('lang-typescript')).toBe(true);
  });

  it('writes lang-java when workspace detects java', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: javaSpringBackend });
    await generateFixCopilotConfig(root, loadFix('fix-java-kafka.md'), fs, ws);
    expect(fs.hasFile('lang-java')).toBe(true);
  });

  it('omits other language files when typescript is detected', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(fs.hasFile('lang-java')).toBe(false);
    expect(fs.hasFile('lang-python')).toBe(false);
    expect(fs.hasFile('lang-csharp')).toBe(false);
  });

  it('omits typescript when java is detected', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: javaSpringBackend });
    await generateFixCopilotConfig(root, loadFix('fix-java-kafka.md'), fs, ws);
    expect(fs.hasFile('lang-typescript')).toBe(false);
  });
});

describe('generateFixCopilotConfig — framework selection (auto-detected via workspace)', () => {
  it('writes fw-react when workspace detects react', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(fs.hasFile('fw-react')).toBe(true);
  });

  it('writes fw-springboot when workspace detects springboot', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: javaSpringBackend });
    await generateFixCopilotConfig(root, loadFix('fix-java-kafka.md'), fs, ws);
    expect(fs.hasFile('fw-springboot')).toBe(true);
  });

  it('omits framework file when workspace detects no framework', async () => {
    const noFw: TechStackDetection = { ...tsReactFrontend, framework: '' as any };
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: noFw });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(fs.hasFile('fw-react')).toBe(false);
    expect(fs.hasFile('fw-springboot')).toBe(false);
  });
});

describe('generateFixCopilotConfig — infra-kafka trigger', () => {
  it('writes infra-kafka when fix.technicalContext.messaging contains "kafka"', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: javaSpringBackend });
    await generateFixCopilotConfig(root, loadFix('fix-java-kafka.md'), fs, ws);
    expect(fs.hasFile('infra-kafka')).toBe(true);
  });

  it('does NOT write infra-kafka when messaging is NA', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(fs.hasFile('infra-kafka')).toBe(false);
  });

  it('kafka instruction contains Consumer and Producer sections', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: javaSpringBackend });
    await generateFixCopilotConfig(root, loadFix('fix-java-kafka.md'), fs, ws);
    const content = fs.contentFor('infra-kafka');
    expect(content).toContain('Consumer');
    expect(content).toContain('Producer');
    expect(content).toContain('DLQ');
  });
});

describe('generateFixCopilotConfig — infra-aws trigger', () => {
  it('writes infra-aws when fix.technicalContext.database contains "dynamodb"', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: javaSpringBackend });
    await generateFixCopilotConfig(root, loadFix('fix-java-kafka.md'), fs, ws);
    expect(fs.hasFile('infra-aws')).toBe(true);
  });

  it('does NOT write infra-aws when database is NA', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(fs.hasFile('infra-aws')).toBe(false);
  });

  it('aws instruction contains DynamoDB section', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: javaSpringBackend });
    await generateFixCopilotConfig(root, loadFix('fix-java-kafka.md'), fs, ws);
    const content = fs.contentFor('infra-aws');
    expect(content).toContain('DynamoDB');
  });

  it('does NOT write infra-glue (Fix has no Glue trigger)', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: javaSpringBackend });
    await generateFixCopilotConfig(root, loadFix('fix-java-kafka.md'), fs, ws);
    expect(fs.hasFile('infra-glue')).toBe(false);
  });
});

describe('generateFixCopilotConfig — pattern triggers', () => {
  it('writes pattern-crud for backend target', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: javaSpringBackend });
    await generateFixCopilotConfig(root, loadFix('fix-java-kafka.md'), fs, ws);
    expect(fs.hasFile('pattern-crud')).toBe(true);
  });

  it('writes pattern-idempotency for backend target', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: javaSpringBackend });
    await generateFixCopilotConfig(root, loadFix('fix-java-kafka.md'), fs, ws);
    expect(fs.hasFile('pattern-idempotency')).toBe(true);
  });

  it('writes pattern-crud and pattern-idempotency for bff target', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsBffStack });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(fs.hasFile('pattern-crud')).toBe(true);
    expect(fs.hasFile('pattern-idempotency')).toBe(true);
  });

  it('writes pattern-bff for bff target', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsBffStack });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(fs.hasFile('pattern-bff')).toBe(true);
  });

  it('does NOT write pattern-contract-testing (Fix never includes it)', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsBffStack });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(fs.hasFile('pattern-contract-testing')).toBe(false);
  });

  it('does NOT write any patterns for frontend target', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(fs.hasFile('pattern-crud')).toBe(false);
    expect(fs.hasFile('pattern-idempotency')).toBe(false);
    expect(fs.hasFile('pattern-bff')).toBe(false);
  });

  it('crud instruction contains Repository and RFC 7807 sections', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: javaSpringBackend });
    await generateFixCopilotConfig(root, loadFix('fix-java-kafka.md'), fs, ws);
    const content = fs.contentFor('pattern-crud');
    expect(content).toContain('Repository');
    expect(content).toContain('RFC 7807');
  });
});

describe('generateFixCopilotConfig — content correctness', () => {
  it('copilot-instructions.md contains the fix title', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    expect(fs.contentFor('copilot-instructions.md')).toContain('Login OAuth2 retorna 500 após expiração do token');
  });

  it('10-fix-context includes the bug symptoms', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    const content = fs.contentFor('10-fix-context');
    expect(content).toContain('500');
  });

  it('11-root-cause includes the hypothesis', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    const content = fs.contentFor('11-root-cause');
    expect(content).toContain('TokenExpiredError');
  });

  it('fix-implement.prompt.md contains Gate markers', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    const content = fs.contentFor('fix-implement.prompt');
    expect(content).toContain('Gate');
  });

  it('fix-review.prompt.md contains DoF criteria', async () => {
    const fs = new InMemoryFileSystem();
    const ws = new WorkspaceStub({ techStack: tsReactFrontend });
    await generateFixCopilotConfig(root, loadFix('fix-complete.md'), fs, ws);
    const content = fs.contentFor('fix-review.prompt');
    expect(content).toContain('DoF');
  });
});
