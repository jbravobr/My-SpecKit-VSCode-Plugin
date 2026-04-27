import { vi } from 'vitest';
import type { CancellationToken, ChatContext, ChatRequest, ChatResponseStream } from 'vscode';
import { TechStackDetection } from '../../src/fix/Fix';
import { IFileSystem } from '../../src/generator/utils/IFileSystem';
import { IWorkspace } from '../../src/generator/utils/IWorkspace';

// ---------------------------------------------------------------------------
// Typed stubs for vscode Chat API — no `as any` needed at call sites
// ---------------------------------------------------------------------------

export interface FakeStream extends ChatResponseStream {
  getCalls(): string[];
  getAllMarkdown(): string;
  anchor: ReturnType<typeof vi.fn>;
  button: ReturnType<typeof vi.fn>;
  filetree: ReturnType<typeof vi.fn>;
  progress: ReturnType<typeof vi.fn>;
  reference: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
}

/** Creates a typed ChatResponseStream that captures markdown() calls. */
export function createMockStream(): FakeStream {
  const calls: string[] = [];
  return {
    markdown: vi.fn((t: string) => {
      calls.push(t);
    }),
    anchor: vi.fn(),
    button: vi.fn(),
    filetree: vi.fn(),
    progress: vi.fn(),
    reference: vi.fn(),
    push: vi.fn(),
    getCalls: () => calls,
    getAllMarkdown: () => calls.join(''),
  };
}

/** Creates a typed CancellationToken that is never cancelled. */
export function createMockToken(): CancellationToken {
  return { isCancellationRequested: false, onCancellationRequested: vi.fn() };
}

/** Creates a typed empty ChatContext. */
export function createMockContext(): ChatContext {
  return { history: [] };
}

/** Creates a typed ChatRequest with the given prompt. */
export function createMockRequest(prompt: string, command?: string): ChatRequest {
  return {
    prompt,
    command,
    references: [],
    toolReferences: [],
    toolInvocationToken: undefined as unknown as import('vscode').ChatParticipantToolToken,
    model: undefined as unknown as import('vscode').LanguageModelChat,
  };
}

/** @deprecated Use InMemoryFileSystem instead — typed and deterministic. */
export function createMockFs(): IFileSystem {
  return {
    ensureDir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    fileExists: vi.fn().mockResolvedValue(false),
    listDir: vi.fn().mockResolvedValue([]),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    deleteDir: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// InMemoryFileSystem — Fake implementation of IFileSystem.
// Stores all written content in a Map keyed by normalized (forward-slash) path.
// ---------------------------------------------------------------------------
export class InMemoryFileSystem implements IFileSystem {
  private readonly files = new Map<string, string>();

  async ensureDir(_dir: string): Promise<void> {}

  async writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(this.normalize(filePath), content);
  }

  async readFile(filePath: string): Promise<string> {
    return this.files.get(this.normalize(filePath)) ?? '';
  }

  async fileExists(filePath: string): Promise<boolean> {
    return this.files.has(this.normalize(filePath));
  }

  async listDir(dirPath: string): Promise<string[]> {
    const normalizedDir = this.normalize(dirPath).replace(/\/$/, '') + '/';
    const entries = new Set<string>();
    for (const p of this.files.keys()) {
      if (p.startsWith(normalizedDir)) {
        const relative = p.slice(normalizedDir.length);
        const firstSegment = relative.split('/')[0];
        entries.add(firstSegment);
      }
    }
    return [...entries];
  }

  async deleteFile(filePath: string): Promise<void> {
    this.files.delete(this.normalize(filePath));
  }

  async deleteDir(dirPath: string): Promise<void> {
    const normalizedDir = this.normalize(dirPath).replace(/\/$/, '') + '/';
    for (const p of this.files.keys()) {
      if (p.startsWith(normalizedDir) || p === this.normalize(dirPath)) {
        this.files.delete(p);
      }
    }
  }

  /** Returns paths of all written files (normalized, forward-slash). */
  writtenPaths(): string[] {
    return [...this.files.keys()];
  }

  /** Returns content written to the first path that ends with `suffix`. */
  contentFor(suffix: string): string | undefined {
    const normalizedSuffix = suffix.replace(/\\/g, '/');
    for (const [path, content] of this.files) {
      if (path.endsWith(normalizedSuffix) || path.includes(normalizedSuffix)) {
        return content;
      }
    }
    return undefined;
  }

  /** Returns true if any written path includes `fragment`. */
  hasFile(fragment: string): boolean {
    const f = fragment.replace(/\\/g, '/');
    return [...this.files.keys()].some((p) => p.includes(f));
  }

  private normalize(p: string): string {
    return p.replace(/\\/g, '/');
  }
}

// ---------------------------------------------------------------------------
// WorkspaceStub — Configurable stub of IWorkspace.
// Accepts optional overrides so each test can configure only what it needs.
// ---------------------------------------------------------------------------
export interface WorkspaceStubConfig {
  workspaceRoot?: string;
  activeSpecPath?: string;
  storyFiles?: string[];
  fixFiles?: string[];
  techStack?: TechStackDetection;
  allTechStacks?: TechStackDetection[];
}

const DEFAULT_STACK: TechStackDetection = {
  language: 'typescript',
  framework: 'react',
  target: 'frontend',
  projectStage: 'brownfield',
  confidence: 'high',
  source: 'package.json',
};

export class WorkspaceStub implements IWorkspace {
  private readonly cfg: Required<WorkspaceStubConfig>;

  constructor(config: WorkspaceStubConfig = {}) {
    this.cfg = {
      workspaceRoot: config.workspaceRoot ?? 'C:/workspace',
      activeSpecPath: config.activeSpecPath ?? 'C:/workspace/.speckit/STORY-001.md',
      storyFiles: config.storyFiles ?? ['STORY-001.md'],
      fixFiles: config.fixFiles ?? [],
      techStack: config.techStack ?? DEFAULT_STACK,
      allTechStacks: config.allTechStacks ?? [config.techStack ?? DEFAULT_STACK],
    };
  }

  getWorkspaceRoot(): string | undefined {
    return this.cfg.workspaceRoot;
  }

  async listStoryFiles(_dir: string): Promise<string[]> {
    return this.cfg.storyFiles;
  }

  async listFixFiles(_dir: string): Promise<string[]> {
    return this.cfg.fixFiles;
  }

  async getActiveStoryPath(): Promise<string | undefined> {
    return this.cfg.activeSpecPath;
  }

  async getActiveSpecPath(): Promise<string | undefined> {
    return this.cfg.activeSpecPath;
  }

  async detectTechStack(): Promise<TechStackDetection> {
    return this.cfg.techStack;
  }

  async detectAllTechStacks(): Promise<TechStackDetection[]> {
    return this.cfg.allTechStacks;
  }
}
