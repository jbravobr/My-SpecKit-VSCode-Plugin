import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import { TraceabilityManager } from '../../../src/workflow/TraceabilityManager';

function createMockFs(overrides: Partial<IFileSystem> = {}): IFileSystem {
  return {
    ensureDir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('not found')),
    fileExists: vi.fn().mockResolvedValue(false),
    listDir: vi.fn().mockResolvedValue([]),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    deleteDir: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('TraceabilityManager', () => {
  let fs: IFileSystem;
  let mgr: TraceabilityManager;

  beforeEach(() => {
    vi.clearAllMocks();
    fs = createMockFs();
    mgr = new TraceabilityManager('/workspace', fs);
  });

  describe('record', () => {
    it('creates new trace for first entry', async () => {
      const trace = await mgr.record('US-001', 'story', {
        type: 'commit',
        description: 'initial commit',
        data: { hash: 'abc123' },
      });

      expect(trace.specId).toBe('US-001');
      expect(trace.specType).toBe('story');
      expect(trace.entries).toHaveLength(1);
      expect(trace.entries[0].type).toBe('commit');
      expect(trace.entries[0].data.hash).toBe('abc123');
      expect(trace.entries[0].timestamp).toBeTruthy();
      expect(fs.writeFile).toHaveBeenCalledOnce();
    });

    it('appends to existing trace', async () => {
      const existingTrace = {
        specId: 'US-001',
        specType: 'story',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        entries: [
          {
            timestamp: '2024-01-01T00:00:00.000Z',
            type: 'commit' as const,
            description: 'first',
            data: {},
          },
        ],
      };
      fs = createMockFs({
        fileExists: vi.fn().mockResolvedValue(true),
        readFile: vi.fn().mockResolvedValue(JSON.stringify(existingTrace)),
      });
      mgr = new TraceabilityManager('/workspace', fs);

      const trace = await mgr.record('US-001', 'story', {
        type: 'gate',
        description: 'advanced to gate 1',
        data: { from: '0', to: '1' },
      });

      expect(trace.entries).toHaveLength(2);
      expect(trace.entries[1].type).toBe('gate');
      expect(trace.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(trace.updatedAt).not.toBe('2024-01-01T00:00:00.000Z');
    });

    it('ensures traceability directory exists', async () => {
      await mgr.record('US-001', 'story', {
        type: 'file',
        description: 'generated spec',
        data: {},
      });

      expect(fs.ensureDir).toHaveBeenCalledWith(expect.stringContaining('.speckit'));
    });

    it('sanitizes spec ID for filename', async () => {
      await mgr.record('US/001<bad>', 'story', {
        type: 'custom',
        description: 'test',
        data: {},
      });

      const writtenPath = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(writtenPath).not.toContain('/');
      expect(writtenPath).not.toContain('<');
      expect(writtenPath).toContain('US_001_bad_');
    });
  });

  describe('load', () => {
    it('returns null when trace file does not exist', async () => {
      const result = await mgr.load('NONEXISTENT');
      expect(result).toBeNull();
    });

    it('returns parsed trace when file exists', async () => {
      const trace = {
        specId: 'US-001',
        specType: 'story',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        entries: [],
      };
      fs = createMockFs({
        fileExists: vi.fn().mockResolvedValue(true),
        readFile: vi.fn().mockResolvedValue(JSON.stringify(trace)),
      });
      mgr = new TraceabilityManager('/workspace', fs);

      const result = await mgr.load('US-001');
      expect(result).toEqual(trace);
    });

    it('returns null on corrupted JSON', async () => {
      fs = createMockFs({
        fileExists: vi.fn().mockResolvedValue(true),
        readFile: vi.fn().mockResolvedValue('not json'),
      });
      mgr = new TraceabilityManager('/workspace', fs);

      const result = await mgr.load('US-001');
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('returns empty array when no traces exist', async () => {
      const result = await mgr.list();
      expect(result).toEqual([]);
    });

    it('returns traces sorted by updatedAt descending', async () => {
      const t1 = {
        specId: 'US-001',
        specType: 'story',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        entries: [],
      };
      const t2 = {
        specId: 'US-002',
        specType: 'story',
        createdAt: '2024-01-02',
        updatedAt: '2024-01-02',
        entries: [],
      };
      fs = createMockFs({
        listDir: vi.fn().mockResolvedValue(['US-001.json', 'US-002.json']),
        fileExists: vi.fn().mockResolvedValue(true),
        readFile: vi
          .fn()
          .mockResolvedValueOnce(JSON.stringify(t1))
          .mockResolvedValueOnce(JSON.stringify(t2)),
      });
      mgr = new TraceabilityManager('/workspace', fs);

      const result = await mgr.list();
      expect(result).toHaveLength(2);
      expect(result[0].specId).toBe('US-002');
    });
  });

  describe('getEntriesByType', () => {
    it('returns entries filtered by type', async () => {
      const trace = {
        specId: 'US-001',
        specType: 'story',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        entries: [
          { timestamp: '2024-01-01', type: 'commit', description: 'c1', data: {} },
          { timestamp: '2024-01-01', type: 'gate', description: 'g1', data: {} },
          { timestamp: '2024-01-01', type: 'commit', description: 'c2', data: {} },
        ],
      };
      fs = createMockFs({
        fileExists: vi.fn().mockResolvedValue(true),
        readFile: vi.fn().mockResolvedValue(JSON.stringify(trace)),
      });
      mgr = new TraceabilityManager('/workspace', fs);

      const commits = await mgr.getEntriesByType('US-001', 'commit');
      expect(commits).toHaveLength(2);
    });

    it('returns empty array when trace does not exist', async () => {
      const result = await mgr.getEntriesByType('NONEXISTENT', 'commit');
      expect(result).toEqual([]);
    });
  });
});
