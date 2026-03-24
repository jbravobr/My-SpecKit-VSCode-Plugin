import { describe, it, expect } from 'vitest';
import { generateTypeScript } from '../../../../src/generator/language/TypeScriptGenerator';
import { generateJavaScript } from '../../../../src/generator/language/JavaScriptGenerator';
import { generateJava } from '../../../../src/generator/language/JavaGenerator';
import { generateCSharp } from '../../../../src/generator/language/CSharpGenerator';
import { generatePython } from '../../../../src/generator/language/PythonGenerator';

const generators = [
  { name: 'TypeScript', fn: generateTypeScript },
  { name: 'JavaScript', fn: generateJavaScript },
  { name: 'Java', fn: generateJava },
  { name: 'CSharp', fn: generateCSharp },
  { name: 'Python', fn: generatePython },
];

describe('language generators', () => {
  generators.forEach(({ name, fn }) => {
    it(`${name}: returns non-empty string`, () => {
      const result = fn();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  it('TypeScript: covers strict mode, interface, Zod, unknown and satisfies', () => {
    const result = generateTypeScript();
    expect(result).toContain('strict');
    expect(result).toContain('interface');
    expect(result).toContain('Zod');
    expect(result).toContain('unknown');
    expect(result).toContain('satisfies');
  });

  it('JavaScript: covers ESM, async and parallel I/O', () => {
    const result = generateJavaScript();
    expect(result).toContain('ESM');
    expect(result).toContain('Async/await');
    expect(result).toContain('Promise.all');
  });

  it('Java: covers Records, constructor injection, Optional and Stream API', () => {
    const result = generateJava();
    expect(result).toContain('Records');
    expect(result).toContain('Constructor injection');
    expect(result).toContain('Optional');
    expect(result).toContain('Stream API');
  });

  it('CSharp: covers Nullable, LINQ and async', () => {
    const result = generateCSharp();
    expect(result).toContain('Nullable');
    expect(result).toContain('LINQ');
    expect(result).toContain('async');
  });

  it('Python: covers type hints, Pydantic and asyncio', () => {
    const result = generatePython();
    expect(result).toContain('Type hints');
    expect(result).toContain('Pydantic');
    expect(result).toContain('asyncio');
  });
});
