import { IFileSystem } from '../../src/generator/utils/IFileSystem';
import { IWorkspace } from '../../src/generator/utils/IWorkspace';
import { TechStackDetection } from '../../src/fix/Fix';

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
    return [...this.files.keys()].some(p => p.includes(f));
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
}

const DEFAULT_STACK: TechStackDetection = {
  language: 'typescript',
  framework: 'react',
  target: 'frontend',
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
}
