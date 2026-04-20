import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkEnvironment,
  probe,
  formatEnvCheckInline,
  EnvironmentReport,
} from '../../../../src/generator/utils/EnvironmentChecker';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';

const tsStack = {
  language: 'typescript' as const,
  framework: 'react' as const,
  target: 'frontend' as const,
  projectStage: 'brownfield' as const,
  confidence: 'high' as const,
  source: 'package.json',
};
const pythonStack = {
  language: 'python' as const,
  framework: 'other' as const,
  target: 'backend' as const,
  projectStage: 'brownfield' as const,
  confidence: 'high' as const,
  source: 'requirements.txt',
};
const javaStack = {
  language: 'java' as const,
  framework: 'springboot' as const,
  target: 'backend' as const,
  projectStage: 'brownfield' as const,
  confidence: 'high' as const,
  source: 'pom.xml',
};
const csharpStack = {
  language: 'csharp' as const,
  framework: 'dotnet' as const,
  target: 'backend' as const,
  projectStage: 'brownfield' as const,
  confidence: 'high' as const,
  source: 'App.csproj',
};

describe('probe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns available=true and parsed version when command succeeds', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('git version 2.43.0'));
    const result = probe('git --version');
    expect(result.available).toBe(true);
    expect(result.version).toBe('2.43.0');
  });

  it('returns available=false when command throws', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });
    const result = probe('git --version');
    expect(result.available).toBe(false);
    expect(result.version).toBeUndefined();
  });

  it('returns available=true with version undefined when no semver in output', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('some tool output without numbers'));
    const result = probe('sometool --version');
    expect(result.available).toBe(true);
    expect(result.version).toBeUndefined();
  });
});

describe('checkEnvironment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always includes Git in results', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('git version 2.43.0'));
    const report = checkEnvironment(tsStack);
    const git = report.tools.find((t) => t.name === 'Git');
    expect(git).toBeDefined();
    expect(git?.required).toBe(true);
  });

  it('includes Node.js and npm for TypeScript stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('v20.11.0'));
    const report = checkEnvironment(tsStack);
    const names = report.tools.map((t) => t.name);
    expect(names).toContain('Node.js');
    expect(names).toContain('npm');
  });

  it('marks Node.js tools as required for TypeScript stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('v20.11.0'));
    const report = checkEnvironment(tsStack);
    const node = report.tools.find((t) => t.name === 'Node.js');
    expect(node?.required).toBe(true);
  });

  it('does not include Python tools for TypeScript stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('v20.11.0'));
    const report = checkEnvironment(tsStack);
    const names = report.tools.map((t) => t.name);
    expect(names).not.toContain('Python');
    expect(names).not.toContain('pip');
  });

  it('includes Python tools for Python stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('Python 3.12.0'));
    const report = checkEnvironment(pythonStack);
    const names = report.tools.map((t) => t.name);
    expect(names).toContain('Python');
    expect(names).toContain('pip');
  });

  it('marks Python tools as required for Python stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('Python 3.12.0'));
    const report = checkEnvironment(pythonStack);
    const python = report.tools.find((t) => t.name === 'Python');
    expect(python?.required).toBe(true);
  });

  it('does not include Node.js tools for Python stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('Python 3.12.0'));
    const report = checkEnvironment(pythonStack);
    const names = report.tools.map((t) => t.name);
    expect(names).not.toContain('Node.js');
  });

  it('marks Node.js/Python/Java/.NET as not required when no stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('some version 1.0.0'));
    const report = checkEnvironment(undefined);
    const notRequired = ['Node.js', 'Python', 'Java', 'Maven', '.NET'];
    for (const name of notRequired) {
      expect(
        report.tools.find((t) => t.name === name)?.required,
        `${name} should not be required`,
      ).toBe(false);
    }
  });

  it('sets stackLanguage from provided stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('v20.11.0'));
    const report = checkEnvironment(tsStack);
    expect(report.stackLanguage).toBe('typescript');
  });

  it('sets stackLanguage undefined when no stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('v20.11.0'));
    const report = checkEnvironment(undefined);
    expect(report.stackLanguage).toBeUndefined();
  });

  it('includes Java and Maven for Java stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('openjdk version 21.0.0'));
    const report = checkEnvironment(javaStack);
    const names = report.tools.map((t) => t.name);
    expect(names).toContain('Java');
    expect(names).toContain('Maven');
  });

  it('marks Java and Maven as required for Java stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('openjdk version 21.0.0'));
    const report = checkEnvironment(javaStack);
    expect(report.tools.find((t) => t.name === 'Java')?.required).toBe(true);
    expect(report.tools.find((t) => t.name === 'Maven')?.required).toBe(true);
  });

  it('does not include Node.js or Python tools for Java stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('openjdk version 21.0.0'));
    const report = checkEnvironment(javaStack);
    const names = report.tools.map((t) => t.name);
    expect(names).not.toContain('Node.js');
    expect(names).not.toContain('Python');
  });

  it('includes .NET for C# stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('8.0.100'));
    const report = checkEnvironment(csharpStack);
    const names = report.tools.map((t) => t.name);
    expect(names).toContain('.NET');
  });

  it('marks .NET as required for C# stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('8.0.100'));
    const report = checkEnvironment(csharpStack);
    expect(report.tools.find((t) => t.name === '.NET')?.required).toBe(true);
  });

  it('does not include Java or Python tools for C# stack', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('8.0.100'));
    const report = checkEnvironment(csharpStack);
    const names = report.tools.map((t) => t.name);
    expect(names).not.toContain('Java');
    expect(names).not.toContain('Python');
  });

  it('checks all tool groups when no stack provided', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('some version 1.0.0'));
    const report = checkEnvironment(undefined);
    const names = report.tools.map((t) => t.name);
    expect(names).toContain('Java');
    expect(names).toContain('Maven');
    expect(names).toContain('.NET');
  });

  it('uses fallback command when primary Python command fails', () => {
    vi.mocked(execSync)
      .mockImplementationOnce(() => Buffer.from('git version 2.43.0')) // git
      .mockImplementationOnce(() => {
        throw new Error('python3 not found');
      }) // python3
      .mockImplementationOnce(() => Buffer.from('Python 3.11.0')) // python (fallback)
      .mockImplementationOnce(() => {
        throw new Error('pip3 not found');
      }) // pip3
      .mockImplementationOnce(() => Buffer.from('pip 23.0')); // pip (fallback)

    const report = checkEnvironment(pythonStack);
    const python = report.tools.find((t) => t.name === 'Python');
    expect(python?.available).toBe(true);
    expect(python?.version).toBe('3.11.0');
  });
});

describe('formatEnvCheckInline', () => {
  const tool = (
    name: string,
    available: boolean,
    required: boolean,
    version?: string,
  ): EnvironmentReport['tools'][0] => ({
    name,
    cmd: `${name} --version`,
    available,
    required,
    version,
  });

  it('returns empty string when no required tools', () => {
    const report: EnvironmentReport = { tools: [tool('Node.js', true, false, '20.0.0')] };
    expect(formatEnvCheckInline(report)).toBe('');
  });

  it('returns OK message when all required tools are available', () => {
    const report: EnvironmentReport = {
      tools: [tool('Git', true, true, '2.43.0'), tool('Node.js', true, true, '20.0.0')],
    };
    const result = formatEnvCheckInline(report);
    expect(result).toContain('✅ **Ambiente verificado**');
    expect(result).toContain('Git 2.43.0');
    expect(result).toContain('Node.js 20.0.0');
  });

  it('uses "disponível" (singular) when only one required tool', () => {
    const report: EnvironmentReport = { tools: [tool('Git', true, true, '2.43.0')] };
    expect(formatEnvCheckInline(report)).toContain('disponível');
    expect(formatEnvCheckInline(report)).not.toContain('disponíveis');
  });

  it('uses "disponíveis" (plural) when multiple required tools', () => {
    const report: EnvironmentReport = {
      tools: [tool('Git', true, true, '2.43.0'), tool('Node.js', true, true, '20.0.0')],
    };
    expect(formatEnvCheckInline(report)).toContain('disponíveis');
  });

  it('omits version when not available', () => {
    const report: EnvironmentReport = { tools: [tool('Git', true, true, undefined)] };
    const result = formatEnvCheckInline(report);
    expect(result).toContain('Git');
    expect(result).not.toContain('undefined');
  });

  it('returns warning message when required tools are missing', () => {
    const report: EnvironmentReport = {
      tools: [tool('Git', false, true), tool('Node.js', true, true, '20.0.0')],
    };
    const result = formatEnvCheckInline(report);
    expect(result).toContain('⚠️ **Ferramentas ausentes para implementação:**');
    expect(result).toContain('Git');
    expect(result).toContain('git-scm.com');
  });

  it('includes install URL for known tools when missing', () => {
    const report: EnvironmentReport = { tools: [tool('.NET', false, true)] };
    const result = formatEnvCheckInline(report);
    expect(result).toContain('dotnet.microsoft.com');
  });

  it('uses generic message for unknown tools without URL', () => {
    const report: EnvironmentReport = { tools: [tool('UnknownTool', false, true)] };
    const result = formatEnvCheckInline(report);
    expect(result).toContain('instalar e adicionar ao PATH');
  });

  it('lists only missing required tools, not missing optional ones', () => {
    const report: EnvironmentReport = {
      tools: [
        tool('Git', true, true, '2.43.0'),
        tool('Python', false, false), // optional, missing
      ],
    };
    const result = formatEnvCheckInline(report);
    expect(result).toContain('✅');
    expect(result).not.toContain('Python');
  });
});
