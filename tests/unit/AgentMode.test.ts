import { describe, expect, it } from 'vitest';
import { TechStackDetection } from '../../src/fix/Fix';
import {
  AGENT_MODES,
  AgentModeName,
  detectAgentMode,
  getActiveAgentMode,
  getAgentModeLabel,
  getAgentModePrompt,
  isValidAgentMode,
  setActiveAgentMode,
} from '../../src/participant/AgentMode';

describe('AgentMode', () => {
  describe('isValidAgentMode', () => {
    it.each<AgentModeName>(['default', 'implementador', 'revisor', 'debugger', 'refactor'])(
      'should return true for valid mode "%s"',
      (mode) => {
        expect(isValidAgentMode(mode)).toBe(true);
      },
    );

    it.each(['invalid', '', 'Debug', 'REFACTOR', 'foo'])('should return false for "%s"', (mode) => {
      expect(isValidAgentMode(mode)).toBe(false);
    });
  });

  describe('detectAgentMode', () => {
    it('should return default when gate is undefined', () => {
      expect(detectAgentMode()).toBe('default');
    });

    it('should return default when gate is negative', () => {
      expect(detectAgentMode(-1)).toBe('default');
    });

    it.each([0, 1, 2])('should return implementador for gate %d', (gate) => {
      expect(detectAgentMode(gate)).toBe('implementador');
    });

    it.each([3, 4])('should return revisor for gate %d', (gate) => {
      expect(detectAgentMode(gate)).toBe('revisor');
    });

    it('should return default for gate > 4', () => {
      expect(detectAgentMode(5)).toBe('default');
    });
  });

  describe('getAgentModeLabel', () => {
    it('should return a label for every mode', () => {
      for (const mode of AGENT_MODES) {
        const label = getAgentModeLabel(mode);
        expect(label).toBeTruthy();
        expect(typeof label).toBe('string');
      }
    });

    it('should contain mode keyword in label', () => {
      expect(getAgentModeLabel('debugger').toLowerCase()).toContain('debugger');
      expect(getAgentModeLabel('refactor').toLowerCase()).toContain('refactor');
    });
  });

  describe('getAgentModePrompt', () => {
    it('should return default prompt without stack', () => {
      const prompt = getAgentModePrompt('default');
      expect(prompt).toContain('Default');
      expect(prompt).toContain('conversacional');
    });

    it('should return implementador prompt with spec reminder', () => {
      const prompt = getAgentModePrompt('implementador');
      expect(prompt).toContain('Implementador');
      expect(prompt).toContain('speckit-implementador');
    });

    it('should return revisor prompt with spec reminder', () => {
      const prompt = getAgentModePrompt('revisor');
      expect(prompt).toContain('Revisor');
      expect(prompt).toContain('speckit-revisor');
    });

    it('should return debugger prompt with protocol steps', () => {
      const prompt = getAgentModePrompt('debugger');
      expect(prompt).toContain('Debugger');
      expect(prompt).toContain('Hipótese');
      expect(prompt).toContain('Evidência');
      expect(prompt).toContain('Fix Mínimo');
      expect(prompt).toContain('Verificação');
      expect(prompt).toContain('NÃO corrija sintomas');
    });

    it('should return refactor prompt with protocol steps', () => {
      const prompt = getAgentModePrompt('refactor');
      expect(prompt).toContain('Refactor');
      expect(prompt).toContain('Snapshot');
      expect(prompt).toContain('Verificação Prévia');
      expect(prompt).toContain('Refatoração');
      expect(prompt).toContain('Rollback');
      expect(prompt).toContain('NÃO adicione features');
    });

    it('should include typescript test command by default', () => {
      const prompt = getAgentModePrompt('debugger');
      expect(prompt).toContain('npx vitest run');
    });

    it('should include java test command when stack is java', () => {
      const stack: TechStackDetection = {
        language: 'java',
        framework: 'springboot',
        target: 'backend',
        projectStage: 'brownfield',
        confidence: 'high',
        source: 'pom.xml',
      };
      const prompt = getAgentModePrompt('debugger', stack);
      expect(prompt).toContain('mvnw verify');
      expect(prompt).toContain('java / springboot');
    });

    it('should include python test command when stack is python', () => {
      const stack: TechStackDetection = {
        language: 'python',
        framework: 'fastapi',
        target: 'backend',
        projectStage: 'brownfield',
        confidence: 'high',
        source: 'pyproject.toml',
      };
      const prompt = getAgentModePrompt('refactor', stack);
      expect(prompt).toContain('pytest');
      expect(prompt).toContain('python / fastapi');
    });

    it('should include csharp test command when stack is csharp', () => {
      const stack: TechStackDetection = {
        language: 'csharp',
        framework: 'dotnet',
        target: 'backend',
        projectStage: 'brownfield',
        confidence: 'high',
        source: 'csproj',
      };
      const prompt = getAgentModePrompt('debugger', stack);
      expect(prompt).toContain('dotnet test');
    });
  });

  describe('active mode state', () => {
    it('should default to "default"', () => {
      setActiveAgentMode('default');
      expect(getActiveAgentMode()).toBe('default');
    });

    it('should persist mode changes', () => {
      setActiveAgentMode('debugger');
      expect(getActiveAgentMode()).toBe('debugger');
      setActiveAgentMode('refactor');
      expect(getActiveAgentMode()).toBe('refactor');
      setActiveAgentMode('default');
    });
  });
});
