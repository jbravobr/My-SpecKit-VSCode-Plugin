import { describe, expect, it } from 'vitest';
import { parseDefaultsYaml } from '../../../src/config/WorkspaceDefaults';

describe('parseDefaultsYaml', () => {
  it('parses all valid fields', () => {
    const yaml = `
language: typescript
framework: react
architecture: hexagonal
target: frontend
projectStage: brownfield
database: PostgreSQL 15
infrastructure: AWS ECS
    `.trim();

    const result = parseDefaultsYaml(yaml);
    expect(result.language).toBe('typescript');
    expect(result.framework).toBe('react');
    expect(result.architecture).toBe('hexagonal');
    expect(result.target).toBe('frontend');
    expect(result.projectStage).toBe('brownfield');
    expect(result.database).toBe('PostgreSQL 15');
    expect(result.infrastructure).toBe('AWS ECS');
  });

  it('parses ci: github-actions correctly', () => {
    const result = parseDefaultsYaml('ci: github-actions');
    expect(result.ci).toBe('github-actions');
  });

  it('parses ci: none correctly', () => {
    const result = parseDefaultsYaml('ci: none');
    expect(result.ci).toBe('none');
  });

  it('rejects invalid ci values', () => {
    const result = parseDefaultsYaml('ci: jenkins');
    expect(result.ci).toBeUndefined();
  });

  it('returns empty object for empty content', () => {
    expect(parseDefaultsYaml('')).toEqual({});
  });

  it('ignores comment lines', () => {
    const yaml = `# This is a comment
language: java
# Another comment
framework: springboot`;
    const result = parseDefaultsYaml(yaml);
    expect(result.language).toBe('java');
    expect(result.framework).toBe('springboot');
  });

  it('rejects invalid language values', () => {
    const result = parseDefaultsYaml('language: cobol');
    expect(result.language).toBeUndefined();
  });

  it('rejects invalid framework values', () => {
    const result = parseDefaultsYaml('framework: cobolrt');
    expect(result.framework).toBeUndefined();
  });

  it('rejects invalid architecture values', () => {
    const result = parseDefaultsYaml('architecture: eventdriven');
    expect(result.architecture).toBeUndefined();
  });

  it('rejects invalid target values', () => {
    const result = parseDefaultsYaml('target: mobile');
    expect(result.target).toBeUndefined();
  });

  it('rejects invalid projectStage values', () => {
    const result = parseDefaultsYaml('projectStage: legacy');
    expect(result.projectStage).toBeUndefined();
  });

  it('accepts partial defaults', () => {
    const yaml = `language: python
database: DynamoDB`;
    const result = parseDefaultsYaml(yaml);
    expect(result.language).toBe('python');
    expect(result.database).toBe('DynamoDB');
    expect(result.framework).toBeUndefined();
    expect(result.architecture).toBeUndefined();
  });

  it('ignores unknown keys', () => {
    const yaml = `language: java
foo: bar
customField: value`;
    const result = parseDefaultsYaml(yaml);
    expect(result.language).toBe('java');
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('ignores lines without colon', () => {
    const yaml = `language: csharp
this is not yaml
framework: dotnet`;
    const result = parseDefaultsYaml(yaml);
    expect(result.language).toBe('csharp');
    expect(result.framework).toBe('dotnet');
  });

  it('ignores keys with empty values', () => {
    const yaml = `language:
framework: react`;
    const result = parseDefaultsYaml(yaml);
    expect(result.language).toBeUndefined();
    expect(result.framework).toBe('react');
  });

  it('handles Windows line endings', () => {
    const yaml = 'language: java\r\nframework: springboot\r\n';
    const result = parseDefaultsYaml(yaml);
    expect(result.language).toBe('java');
    expect(result.framework).toBe('springboot');
  });
});
