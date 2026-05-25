import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSpeckitRequest } from '../../../src/participant/speckitParticipant';
import {
  createMockContext,
  createMockRequest,
  createMockStream,
  createMockToken,
} from '../../support/fakes';

type ParticipantGraphRuntime = NonNullable<Parameters<typeof handleSpeckitRequest>[4]>;
type GateEnsure = ParticipantGraphRuntime['gate']['ensure'];

function setWorkspaceRoot(workspaceRoot: string): void {
  Object.defineProperty(vscode.workspace, 'workspaceFolders', {
    configurable: true,
    value: [{ uri: vscode.Uri.file(workspaceRoot) }],
  });
}

function createGraphRuntimeMock(ensure: GateEnsure): ParticipantGraphRuntime {
  return { gate: { ensure } };
}

describe('participant graph freshness gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setWorkspaceRoot('C:/workspace');
  });

  it('emits warning markdown for stale-async gate result', async () => {
    const stream = createMockStream();
    const ensure = vi.fn<GateEnsure>().mockResolvedValue({
      status: 'stale-async',
      warning: '> stale graph',
      durationMs: 12,
    });

    await handleSpeckitRequest(
      createMockRequest('', 'unknown'),
      createMockContext(),
      stream,
      createMockToken(),
      createGraphRuntimeMock(ensure),
    );

    expect(ensure).toHaveBeenCalledWith('C:/workspace', { commandName: 'unknown' });
    expect(stream.getCalls()[0]).toBe('> stale graph\n\n');
  });

  it('does not emit gate markdown for fresh gate result', async () => {
    const stream = createMockStream();
    const ensure = vi.fn<GateEnsure>().mockResolvedValue({ status: 'fresh', durationMs: 8 });

    await handleSpeckitRequest(
      createMockRequest('', 'unknown'),
      createMockContext(),
      stream,
      createMockToken(),
      createGraphRuntimeMock(ensure),
    );

    expect(stream.getCalls()).not.toContain('\n\n');
    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis');
  });

  it('does not emit gate markdown for no-op gate result', async () => {
    const stream = createMockStream();
    const ensure = vi.fn<GateEnsure>().mockResolvedValue({ status: 'no-op', durationMs: 1 });

    await handleSpeckitRequest(
      createMockRequest('', 'unknown'),
      createMockContext(),
      stream,
      createMockToken(),
      createGraphRuntimeMock(ensure),
    );

    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis');
    expect(stream.getAllMarkdown()).not.toContain('GRAPH_STALE_WARNING');
  });

  it('continues command execution without warning when gate throws', async () => {
    const stream = createMockStream();
    const ensure = vi.fn<GateEnsure>().mockRejectedValue(new Error('gate unavailable'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await handleSpeckitRequest(
      createMockRequest('', 'unknown'),
      createMockContext(),
      stream,
      createMockToken(),
      createGraphRuntimeMock(ensure),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      'Unable to evaluate SpecKit graph freshness gate:',
      expect.any(Error),
    );
    expect(stream.getAllMarkdown()).toContain('Comandos disponíveis');
    expect(stream.getAllMarkdown()).not.toContain('gate unavailable');

    warnSpy.mockRestore();
  });
});
