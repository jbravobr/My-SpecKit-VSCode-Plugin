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

  it('SpringBoot: covers Kafka listener, query, pagination, error handling and observability', () => {
    const result = generateSpringBoot();
    expect(result).toContain('@KafkaListener');
    expect(result).toContain('@Query');
    expect(result).toContain('Pageable');
    expect(result).toContain('ProblemDetail');
    expect(result).toContain('@ControllerAdvice');
  });

  it('Angular: covers RxJS, OnPush and ChangeDetectionStrategy', () => {
    const result = generateAngular();
    expect(result).toContain('RxJS');
    expect(result).toContain('OnPush');
    expect(result).toContain('ChangeDetectionStrategy');
  });

  it('React: covers hooks, key and useCallback', () => {
    const result = generateReact();
    expect(result).toContain('useState');
    expect(result).toContain('key');
    expect(result).toContain('useCallback');
  });

  it('DotNet: covers IOptions, async Task and ILogger', () => {
    const result = generateDotNet();
    expect(result).toContain('IOptions');
    expect(result).toContain('async Task');
    expect(result).toContain('ILogger');
  });

  it('FastAPI: covers Pydantic, async def and Depends', () => {
    const result = generateFastApi();
    expect(result).toContain('Pydantic');
    expect(result).toContain('async def');
    expect(result).toContain('Depends');
  });
});
