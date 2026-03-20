import { vi } from 'vitest';

export const Uri = {
  file: (path: string) => ({ fsPath: path, toString: () => `file://${path}` }),
};

export const workspace = {
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
};

export const window = {
  showTextDocument: vi.fn().mockResolvedValue(undefined),
};

export const FileType = {
  File: 1,
  Directory: 2,
};

export class ThemeIcon {
  constructor(public id: string) {}
}

export const chat = {
  createChatParticipant: vi.fn(),
};

export type ChatRequest = Record<string, unknown>;
export type ChatResponseStream = { markdown(text: string): void };
export type CancellationToken = Record<string, unknown>;
export type ExtensionContext = Record<string, unknown>;
