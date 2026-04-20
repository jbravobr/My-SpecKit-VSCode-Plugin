import { describe, expect, it } from 'vitest';
import {
  generateFixId,
  generateStoryId,
  normalizeAAA,
} from '../../../src/generator/utils/SpecIdGenerator';

describe('normalizeAAA', () => {
  it('extracts last directory segment, uppercases, removes special chars', () => {
    expect(normalizeAAA('/home/user/my-project')).toBe('MYPROJECT');
    expect(normalizeAAA('C:\\Users\\dev\\My Project')).toBe('MYPROJECT');
  });

  it('truncates to 10 characters', () => {
    expect(normalizeAAA('/workspace/super-long-project-name-here')).toBe('SUPERLONGP');
  });

  it('handles simple names', () => {
    expect(normalizeAAA('/workspace/api')).toBe('API');
    expect(normalizeAAA('C:\\workspace')).toBe('WORKSPACE');
  });
});

describe('generateStoryId', () => {
  const root = '/workspace/speckit';
  const fixedDate = new Date(2026, 3, 15, 14, 30); // 2026-04-15 14:30

  it('generates US-{AAA}-{YYYYMMDD}-{HHMM} format', () => {
    const id = generateStoryId(root, [], fixedDate);
    expect(id).toBe('US-SPECKIT-20260415-1430');
  });

  it('advances minute on collision', () => {
    const existing = ['US-SPECKIT-20260415-1430.md'];
    const id = generateStoryId(root, existing, fixedDate);
    expect(id).toBe('US-SPECKIT-20260415-1431');
  });

  it('advances multiple minutes for consecutive collisions', () => {
    const existing = [
      'US-SPECKIT-20260415-1430.md',
      'US-SPECKIT-20260415-1431.md',
      'US-SPECKIT-20260415-1432.md',
    ];
    const id = generateStoryId(root, existing, fixedDate);
    expect(id).toBe('US-SPECKIT-20260415-1433');
  });

  it('throws after 60 collision attempts', () => {
    const existing = Array.from({ length: 60 }, (_, i) => {
      const d = new Date(fixedDate.getTime() + i * 60_000);
      const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      return `US-SPECKIT-${ts}.md`;
    });
    expect(() => generateStoryId(root, existing, fixedDate)).toThrow(
      'Não foi possível gerar um ID único',
    );
  });

  it('works with no existing files', () => {
    const id = generateStoryId(root, [], fixedDate);
    expect(id).toMatch(/^US-SPECKIT-\d{8}-\d{4}$/);
  });

  it('handles collision without .md extension in existing files', () => {
    const existing = ['US-SPECKIT-20260415-1430'];
    const id = generateStoryId(root, existing, fixedDate);
    expect(id).toBe('US-SPECKIT-20260415-1431');
  });
});

describe('generateFixId', () => {
  const root = 'C:\\Users\\dev\\my-app';
  const fixedDate = new Date(2026, 0, 1, 9, 5); // 2026-01-01 09:05

  it('generates FIX-{AAA}-{YYYYMMDD}-{HHMM} format', () => {
    const id = generateFixId(root, [], fixedDate);
    expect(id).toBe('FIX-MYAPP-20260101-0905');
  });

  it('advances minute on collision', () => {
    const existing = ['FIX-MYAPP-20260101-0905.md'];
    const id = generateFixId(root, existing, fixedDate);
    expect(id).toBe('FIX-MYAPP-20260101-0906');
  });

  it('handles midnight boundary (hour wrap)', () => {
    const midnight = new Date(2026, 0, 1, 23, 59);
    const existing = ['FIX-MYAPP-20260101-2359.md'];
    const id = generateFixId(root, existing, midnight);
    // Next minute is 00:00 of the next day
    expect(id).toBe('FIX-MYAPP-20260102-0000');
  });
});
