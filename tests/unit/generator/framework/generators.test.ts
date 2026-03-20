import { describe, it, expect } from 'vitest';
import { generateDotNet } from '../../../../src/generator/framework/DotNetGenerator';
import { generateSpringBoot } from '../../../../src/generator/framework/SpringBootGenerator';
import { generateAngular } from '../../../../src/generator/framework/AngularGenerator';
import { generateReact } from '../../../../src/generator/framework/ReactGenerator';
import { generateFastApi } from '../../../../src/generator/framework/FastApiGenerator';

const generators = [
  { name: 'DotNet', fn: generateDotNet },
  { name: 'SpringBoot', fn: generateSpringBoot },
  { name: 'Angular', fn: generateAngular },
  { name: 'React', fn: generateReact },
  { name: 'FastApi', fn: generateFastApi },
];

describe('framework generators', () => {
  generators.forEach(({ name, fn }) => {
    it(`${name}: returns non-empty string`, () => {
      const result = fn();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
