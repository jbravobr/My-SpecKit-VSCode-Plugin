import { IFileSystem } from '../generator/utils/IFileSystem';
import { appendLog } from '../generator/utils/SessionLogger';
import { AuditEvent, AuditLogger } from './AuditLogger';
import type { AgentExecutionMode } from './ObservabilityContext';
import {
  buildSessionAlias,
  createCorrelationId,
  inferAgentModeFromGate,
} from './ObservabilityContext';
import { TraceabilityManager } from './TraceabilityManager';

type TraceType = 'commit' | 'file' | 'gate' | 'review' | 'custom';

export interface CommandTelemetryInput {
  workspaceRoot: string;
  fs: IFileSystem;
  audit: AuditLogger;
  tracer?: TraceabilityManager;
  command: string;
  outcome: string;
  detail?: string;
  commandExecutionId?: string;
  sessionId?: string;
  batchId?: string;
  specId?: string;
  specTitle?: string;
  specType?: 'story' | 'fix';
  gate?: number;
  agentMode?: AgentExecutionMode;
  sessionAlias?: string;
  llmResponseReceived?: boolean;
  auditEvent?: AuditEvent;
  traceType?: TraceType;
  traceDescription?: string;
  traceData?: Record<string, string>;
}

export async function emitCommandTelemetry(input: CommandTelemetryInput): Promise<void> {
  const sessionId = input.sessionId ?? createCorrelationId('session');
  const gate = input.gate;
  const agentMode = input.agentMode ?? inferAgentModeFromGate(gate);
  const sessionAlias =
    input.sessionAlias ?? buildSessionAlias(input.specId, input.specTitle, agentMode, gate);

  await appendLog(
    input.workspaceRoot,
    {
      command: input.command,
      specId: input.specId,
      specTitle: input.specTitle,
      outcome: input.outcome,
      detail: input.detail,
      commandExecutionId: input.commandExecutionId,
      sessionId,
      batchId: input.batchId,
      agentMode,
      gate,
      sessionAlias,
      llmResponseReceived: input.llmResponseReceived,
    },
    input.fs,
  );

  await input.audit.log(input.auditEvent ?? 'command', `${input.command}: ${input.outcome}`, {
    command: input.command,
    commandExecutionId: input.commandExecutionId,
    sessionId,
    batchId: input.batchId,
    specId: input.specId,
    agentMode,
    gate,
    sessionAlias,
  });

  if (!input.tracer || !input.specId || !input.specType) return;

  try {
    await input.tracer.record(input.specId, input.specType, {
      type: input.traceType ?? 'custom',
      description: input.traceDescription ?? `${input.command}: ${input.outcome}`,
      data: {
        command: input.command,
        commandExecutionId: input.commandExecutionId ?? '',
        sessionId,
        batchId: input.batchId ?? '',
        specId: input.specId,
        agentMode,
        gate: gate !== undefined ? String(gate) : '',
        sessionAlias,
        ...(input.traceData ?? {}),
      },
    });
  } catch {
    // Traceability should never break the main flow
  }
}
