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
});
