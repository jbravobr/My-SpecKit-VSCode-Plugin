import { describe, it, expect } from 'vitest';
import { generateCrudPattern } from '../../../../src/generator/pattern/CrudPatternGenerator';
import { generateBffPattern } from '../../../../src/generator/pattern/BffPatternGenerator';

describe('pattern generators', () => {
  it('CrudPattern (java/springboot): returns non-empty string', () => {
    const result = generateCrudPattern('java', 'springboot');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('CrudPattern (csharp/dotnet): returns non-empty string', () => {
    const result = generateCrudPattern('csharp', 'dotnet');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('CrudPattern: does not throw for empty strings', () => {
    expect(() => generateCrudPattern('', '')).not.toThrow();
  });

  it('BffPattern: returns non-empty string', () => {
    const result = generateBffPattern();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('CrudPattern (java/springboot): covers repository, query, pagination and error handling', () => {
    const result = generateCrudPattern('java', 'springboot');
    expect(result).toContain('JpaRepository');
    expect(result).toContain('@Query');
    expect(result).toContain('Pageable');
    expect(result).toContain('RFC 7807');
  });

  it('CrudPattern (csharp/dotnet): covers DbSet, validation and error handling', () => {
    const result = generateCrudPattern('csharp', 'dotnet');
    expect(result).toContain('DbSet');
    expect(result).toContain('FluentValidation');
    expect(result).toContain('RFC 7807');
  });

  it('BffPattern: covers token relay, circuit breaker, RFC 7807 and statelessness', () => {
    const result = generateBffPattern();
    expect(result).toContain('token');
    expect(result).toContain('ircuit');
    expect(result).toContain('RFC 7807');
    expect(result).toContain('tateless');
  });
});
