import { vi } from 'vitest';

export const Uri = {
  file: (path: string) => ({ fsPath: path, toString: () => `file://${path}` }),
};

export const workspace = {
  onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  createFileSystemWatcher: vi.fn(() => ({
    onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
    onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
    dispose: vi.fn(),
  })),
  fs: {
    createDirectory: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(new Uint8Array()),
    stat: vi.fn().mockResolvedValue({ type: 1 }),
    readDirectory: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined,
  openTextDocument: vi.fn().mockResolvedValue({}),
  getConfiguration: vi.fn().mockReturnValue({
    get: <T>(key: string, defaultValue?: T): T | undefined => {
      if (key === 'enabled') {
        return false as T;
      }
      return defaultValue;
    },
  }),
  findFiles: vi.fn().mockResolvedValue([]),
};

export const window = {
  showTextDocument: vi.fn().mockResolvedValue(undefined),
};

export const FileType = {
  File: 1,
  Directory: 2,
};

export class RelativePattern {
  constructor(
    public readonly base: string,
    public readonly pattern: string,
  ) {}
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export const chat = {
  createChatParticipant: vi.fn(),
};

export interface ChatRequest {
  prompt: string;
  command?: string;
}

export interface ChatResponseStream {
  markdown(text: string): void;
  button?(options: { title: string; command: string; arguments?: unknown[] }): void;
}

export interface CancellationToken {
  isCancellationRequested: boolean;
  onCancellationRequested: (...args: unknown[]) => void;
}

export type ExtensionContext = Record<string, unknown>;
