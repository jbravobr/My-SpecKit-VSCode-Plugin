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

/** Returns the content written to a path that includes `suffix` */
function contentFor(mockFs: ReturnType<typeof createMockFs>, suffix: string): string | undefined {
  const calls: [string, string][] = mockFs.writeFile.mock.calls;
  const match = calls.find(([filePath]) => filePath.replace(/\\/g, '/').includes(suffix));
  return match?.[1];
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

  // Camada 3 — Smoke test E2E: verifica paths e conteúdo mínimo

  it('writes copilot-instructions.md with story title', async () => {
    const mockFs = createMockFs();
    await generateCopilotConfig(root, completeStory, mockFs);
    const content = contentFor(mockFs, 'copilot-instructions.md');
    expect(content).toBeDefined();
    expect(content).toContain('Autenticação via OAuth2 com GitHub');
  });

  it('writes 10-business-context.instructions.md with problem text', async () => {
    const mockFs = createMockFs();
    await generateCopilotConfig(root, completeStory, mockFs);
    const content = contentFor(mockFs, '10-business-context.instructions.md');
    expect(content).toBeDefined();
    expect(content).toContain('Os usuários precisam criar contas manualmente');
  });

  it('writes 11-functional-spec.instructions.md with first user story', async () => {
    const mockFs = createMockFs();
    await generateCopilotConfig(root, completeStory, mockFs);
    const content = contentFor(mockFs, '11-functional-spec.instructions.md');
    expect(content).toBeDefined();
    expect(content).toContain('Como usuário, quero fazer login com minha conta GitHub');
  });

  it('writes 14-architecture-pattern.instructions.md', async () => {
    const mockFs = createMockFs();
    await generateCopilotConfig(root, completeStory, mockFs);
    const content = contentFor(mockFs, '14-architecture-pattern.instructions.md');
    expect(content).toBeDefined();
    expect(content).toContain('Hexagonal');
  });

  it('writes 15-dod-checklist.instructions.md with DoD criteria', async () => {
    const mockFs = createMockFs();
    await generateCopilotConfig(root, completeStory, mockFs);
    const content = contentFor(mockFs, '15-dod-checklist.instructions.md');
    expect(content).toBeDefined();
    expect(content).toContain('Todos os critérios de aceite validados por testes automatizados');
  });

  it('writes prompts/implement.prompt.md with gate markers', async () => {
    const mockFs = createMockFs();
    await generateCopilotConfig(root, completeStory, mockFs);
    const content = contentFor(mockFs, 'implement.prompt.md');
    expect(content).toBeDefined();
    expect(content).toContain('Gate 1');
    expect(content).toContain('Gate 2');
  });

  it('writes prompts/review.prompt.md with gate markers and DoD', async () => {
    const mockFs = createMockFs();
    await generateCopilotConfig(root, completeStory, mockFs);
    const content = contentFor(mockFs, 'review.prompt.md');
    expect(content).toBeDefined();
    expect(content).toContain('Gate 3');
    expect(content).toContain('Gate 4');
    expect(content).toContain('Todos os critérios de aceite validados por testes automatizados');
  });

  it('writes prompts/run.prompt.md with all 4 gates and stack', async () => {
    const mockFs = createMockFs();
    await generateCopilotConfig(root, completeStory, mockFs);
    const content = contentFor(mockFs, 'run.prompt.md');
    expect(content).toBeDefined();
    expect(content).toContain('Gate 1');
    expect(content).toContain('Gate 2');
    expect(content).toContain('Gate 3');
    expect(content).toContain('Gate 4');
    expect(content).toContain('typescript');
    expect(content).toContain('react');
  });
});
