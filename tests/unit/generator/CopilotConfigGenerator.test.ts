import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseStory } from '../../../src/story/StoryParser';
import { generateCopilotConfig } from '../../../src/generator/CopilotConfigGenerator';
import { IFileSystem } from '../../../src/generator/utils/IFileSystem';

const fixturesDir = resolve(__dirname, '../../fixtures');
const completeStoryMd = readFileSync(resolve(fixturesDir, 'story-complete.md'), 'utf-8');
const completeStory = parseStory(completeStoryMd);

const root = resolve('fake-test-workspace');

function createMockFs(): IFileSystem & { ensureDir: ReturnType<typeof vi.fn>; writeFile: ReturnType<typeof vi.fn> } {
  return {
    ensureDir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    fileExists: vi.fn().mockResolvedValue(false),
  };
}

describe('generateCopilotConfig', () => {
  it('writes 18 files for complete story (typescript + react)', async () => {
    const mockFs = createMockFs();
    const files = await generateCopilotConfig(root, completeStory, mockFs);
    expect(files).toHaveLength(18);
  });

  it('calls ensureDir exactly 3 times', async () => {
    const mockFs = createMockFs();
    await generateCopilotConfig(root, completeStory, mockFs);
    expect(mockFs.ensureDir).toHaveBeenCalledTimes(3);
  });

  it('writes 17 files when language is not set', async () => {
    const story = { ...completeStory, technicalSpec: { ...completeStory.technicalSpec, language: '' as const } };
    const mockFs = createMockFs();
    const files = await generateCopilotConfig(root, story, mockFs);
    expect(files).toHaveLength(17);
  });

  it('writes 17 files when framework is not set', async () => {
    const story = { ...completeStory, technicalSpec: { ...completeStory.technicalSpec, framework: '' as const } };
    const mockFs = createMockFs();
    const files = await generateCopilotConfig(root, story, mockFs);
    expect(files).toHaveLength(17);
  });

  it('returns paths with forward slashes only', async () => {
    const mockFs = createMockFs();
    const files = await generateCopilotConfig(root, completeStory, mockFs);
    expect(files.every(f => !f.includes('\\'))).toBe(true);
  });

  it('includes copilot-instructions.md in returned paths', async () => {
    const mockFs = createMockFs();
    const files = await generateCopilotConfig(root, completeStory, mockFs);
    expect(files.some(f => f.endsWith('copilot-instructions.md'))).toBe(true);
  });

  it('includes language-specific instruction file', async () => {
    const mockFs = createMockFs();
    const files = await generateCopilotConfig(root, completeStory, mockFs);
    expect(files.some(f => f.includes('lang-typescript'))).toBe(true);
  });

  it('includes framework-specific instruction file', async () => {
    const mockFs = createMockFs();
    const files = await generateCopilotConfig(root, completeStory, mockFs);
    expect(files.some(f => f.includes('fw-react'))).toBe(true);
  });
});
