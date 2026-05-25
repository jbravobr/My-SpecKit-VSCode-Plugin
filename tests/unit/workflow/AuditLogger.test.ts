import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IFileSystem } from '../../../src/generator/utils/IFileSystem';
import { AuditLogger } from '../../../src/workflow/AuditLogger';
import { InMemoryFileSystem } from '../../support/fakes';

describe('AuditLogger', () => {
  let fs: InMemoryFileSystem;
  let logger: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    fs = new InMemoryFileSystem();
    logger = new AuditLogger('/workspace', fs);
  });

  describe('log', () => {
    it('writes audit entry to log file', async () => {
      await logger.log('command', 'user ran /new');

      const content = fs.contentFor('audit.log');
      expect(content).toBeDefined();
      expect(content).toMatch(/\[.*\] command: user ran \/new\n/);
    });

    it('appends to existing log content', async () => {
      await fs.writeFile(
        '/workspace/.speckit/audit.log',
        '[2024-01-01T00:00:00.000Z] command: first\n',
      );
      logger = new AuditLogger('/workspace', fs);

      await logger.log('file_write', 'wrote spec.md');

      const content = fs.contentFor('audit.log')!;
      expect(content).toContain('command: first');
      expect(content).toContain('file_write: wrote spec.md');
    });

    it('creates fresh log when file does not exist', async () => {
      await logger.log('gate_transition', 'gate 0 → 1');

      const content = fs.contentFor('audit.log')!;
      expect(content).toMatch(/^\[.*\] gate_transition: gate 0 → 1\n$/);
    });

    it('does not throw when write fails', async () => {
      const failingFs: IFileSystem = {
        ensureDir: async () => {},
        writeFile: async () => {
          throw new Error('disk full');
        },
        readFile: async () => '',
        fileExists: async () => false,
        listDir: async () => [],
        deleteFile: async () => {},
        deleteDir: async () => {},
      };
      const failLogger = new AuditLogger('/workspace', failingFs);

      await expect(failLogger.log('command', 'test')).resolves.toBeUndefined();
    });

    it('supports all event types', async () => {
      const events = [
        'file_edit',
        'file_write',
        'command',
        'tool_call',
        'permission',
        'gate_transition',
        'graph.build',
        'graph.refresh.incremental',
        'graph.stale.detected',
        'graph.gate.injected',
        'graph.veto.triggered',
        'graph.batch.refresh',
        'graph.perf.violation',
      ] as const;

      for (const event of events) {
        await logger.log(event, `test ${event}`);
      }

      const content = fs.contentFor('audit.log')!;
      for (const event of events) {
        expect(content).toContain(`${event}: test ${event}`);
      }
    });

    it('serializes concurrent writes without data loss', async () => {
      const p1 = logger.log('command', 'first');
      const p2 = logger.log('command', 'second');
      const p3 = logger.log('command', 'third');
      await Promise.all([p1, p2, p3]);

      const content = fs.contentFor('audit.log')!;
      expect(content).toContain('command: first');
      expect(content).toContain('command: second');
      expect(content).toContain('command: third');
      // All three lines should be present (no overwrite)
      const lines = content.split('\n').filter(Boolean);
      expect(lines).toHaveLength(3);
    });

    it('redacts sensitive values from detail and context', async () => {
      await logger.log('command', 'token="ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"', {
        authorization: 'Bearer eyJ12345678.eyJabcdefgh.abcdefghijk',
      });

      const content = fs.contentFor('audit.log')!;
      expect(content).not.toContain('ghp_1234567890abcdefghijklmnopqrstuvwxyzAB');
      expect(content).not.toContain('eyJ12345678.eyJabcdefgh.abcdefghijk');
      expect(content).toContain('[REDACTED]');
    });

    it('normalizes multi-line payloads to avoid forged log lines', async () => {
      await logger.log('command', 'first line\ninjected line', {
        note: 'header\r\nforged',
      });

      const lines = (fs.contentFor('audit.log') ?? '').split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('first line injected line');
      expect(lines[0]).toContain('note="header forged"');
    });

    it('logGraphEvent serializes graph payload context', async () => {
      await logger.logGraphEvent('graph.build', {
        workspaceFolder: '/workspace',
        nodesCount: 3,
        edgesCount: 2,
        durationMs: 50,
        partialLanguages: ['java', 'python'],
      });

      const content = fs.contentFor('audit.log')!;
      expect(content).toContain('graph.build: graph.build');
      expect(content).toContain('workspaceFolder="/workspace"');
      expect(content).toContain('partialLanguages="java,python"');
    });
  });

  describe('readLog', () => {
    it('returns empty array when log does not exist', async () => {
      const lines = await logger.readLog();
      expect(lines).toEqual([]);
    });

    it('returns parsed lines when log exists', async () => {
      await fs.writeFile(
        '/workspace/.speckit/audit.log',
        '[2024-01-01T00:00:00.000Z] command: first\n[2024-01-01T00:00:01.000Z] file_write: second\n',
      );
      logger = new AuditLogger('/workspace', fs);

      const lines = await logger.readLog();
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('command: first');
    });

    it('returns empty array on read error', async () => {
      const failingFs: IFileSystem = {
        ensureDir: async () => {},
        writeFile: async () => {},
        readFile: async () => {
          throw new Error('corrupted');
        },
        fileExists: async () => true,
        listDir: async () => [],
        deleteFile: async () => {},
        deleteDir: async () => {},
      };
      const failLogger = new AuditLogger('/workspace', failingFs);

      const lines = await failLogger.readLog();
      expect(lines).toEqual([]);
    });
  });

  describe('getLogPath', () => {
    it('returns path under .speckit directory', () => {
      expect(logger.getLogPath()).toContain('.speckit');
      expect(logger.getLogPath()).toContain('audit.log');
    });
  });
});
