import * as path from 'path';
import { IFileSystem } from '../generator/utils/IFileSystem';
import { createCorrelationId } from './ObservabilityContext';

const GOVERNANCE_DIR = path.join('.speckit', 'governance');
const GOVERNANCE_FILE = path.join(GOVERNANCE_DIR, 'transition-state.json');

export type TransitionIntentKind =
  | 'gate-transition'
  | 'mode-switch'
  | 'status-retrofit'
  | 'batch-consent'
  | 'branch-governance';

export interface TransitionIntent {
  id: string;
  kind: TransitionIntentKind;
  command: string;
  createdAt: string;
  expiresAt: string;
  payload: Record<string, string>;
}

export interface BatchSessionConsent {
  id: string;
  createdAt: string;
  expiresAt: string;
  commandExecutionId?: string;
  note?: string;
}

export type BranchResolutionStrategy = 'session' | 'cited';
export type BranchSessionSource = 'current' | 'created';

export interface BranchSessionGovernance {
  id: string;
  sessionId: string;
  strategy: BranchResolutionStrategy;
  command: string;
  createdAt: string;
  updatedAt: string;
  citedMentions: string[];
  sessionBranch?: string;
  sessionBranchSource?: BranchSessionSource;
}

interface GovernanceState {
  version: 1;
  intents: TransitionIntent[];
  batchSessionConsent?: BatchSessionConsent;
  branchSessionGovernance?: BranchSessionGovernance;
}

const EMPTY_STATE: GovernanceState = {
  version: 1,
  intents: [],
};

const RUNTIME_SESSION_ID = createCorrelationId('session');

function statePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, GOVERNANCE_FILE);
}

function nowIso(): string {
  return new Date().toISOString();
}

function withExpiry(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function isExpired(isoDate: string): boolean {
  return new Date(isoDate).getTime() <= Date.now();
}

async function loadState(workspaceRoot: string, fs: IFileSystem): Promise<GovernanceState> {
  const filePath = statePath(workspaceRoot);
  const exists = await fs.fileExists(filePath);
  if (!exists) return { ...EMPTY_STATE };

  try {
    const content = await fs.readFile(filePath);
    const parsed = JSON.parse(content) as Partial<GovernanceState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.intents)) {
      return { ...EMPTY_STATE };
    }
    return {
      version: 1,
      intents: parsed.intents,
      batchSessionConsent: parsed.batchSessionConsent,
      branchSessionGovernance: parsed.branchSessionGovernance,
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

async function saveState(
  workspaceRoot: string,
  fs: IFileSystem,
  state: GovernanceState,
): Promise<void> {
  const dirPath = path.join(workspaceRoot, GOVERNANCE_DIR);
  await fs.ensureDir(dirPath);
  await fs.writeFile(statePath(workspaceRoot), JSON.stringify(state, null, 2));
}

function pruneExpiredState(state: GovernanceState): GovernanceState {
  const intents = state.intents.filter((intent) => !isExpired(intent.expiresAt));
  const batchSessionConsent =
    state.batchSessionConsent && !isExpired(state.batchSessionConsent.expiresAt)
      ? state.batchSessionConsent
      : undefined;
  const branchSessionGovernance =
    state.branchSessionGovernance?.sessionId === RUNTIME_SESSION_ID
      ? state.branchSessionGovernance
      : undefined;

  return {
    ...state,
    intents,
    batchSessionConsent,
    branchSessionGovernance,
  };
}

export async function createTransitionIntent(
  workspaceRoot: string,
  fs: IFileSystem,
  input: {
    kind: TransitionIntentKind;
    command: string;
    payload: Record<string, string>;
    ttlMinutes?: number;
  },
): Promise<TransitionIntent> {
  const ttlMinutes = input.ttlMinutes ?? 30;
  const state = pruneExpiredState(await loadState(workspaceRoot, fs));

  const intent: TransitionIntent = {
    id: createCorrelationId('exec'),
    kind: input.kind,
    command: input.command,
    createdAt: nowIso(),
    expiresAt: withExpiry(ttlMinutes),
    payload: input.payload,
  };

  const nextState: GovernanceState = {
    ...state,
    intents: [...state.intents, intent],
  };
  await saveState(workspaceRoot, fs, nextState);
  return intent;
}

export async function getTransitionIntent(
  workspaceRoot: string,
  fs: IFileSystem,
  intentId: string,
): Promise<TransitionIntent | undefined> {
  const state = pruneExpiredState(await loadState(workspaceRoot, fs));
  await saveState(workspaceRoot, fs, state);
  const intent = state.intents.find((item) => item.id === intentId);
  return intent;
}

export async function consumeTransitionIntent(
  workspaceRoot: string,
  fs: IFileSystem,
  intentId: string,
  expectedKind?: TransitionIntentKind,
): Promise<TransitionIntent | undefined> {
  const state = pruneExpiredState(await loadState(workspaceRoot, fs));
  const intent = state.intents.find((item) => item.id === intentId);
  if (!intent) {
    await saveState(workspaceRoot, fs, state);
    return undefined;
  }

  if (expectedKind && intent.kind !== expectedKind) {
    await saveState(workspaceRoot, fs, state);
    return undefined;
  }

  const nextState: GovernanceState = {
    ...state,
    intents: state.intents.filter((item) => item.id !== intentId),
  };
  await saveState(workspaceRoot, fs, nextState);
  return intent;
}

export async function setBatchSessionConsent(
  workspaceRoot: string,
  fs: IFileSystem,
  input: { commandExecutionId?: string; ttlMinutes?: number; note?: string },
): Promise<BatchSessionConsent> {
  const ttlMinutes = input.ttlMinutes ?? 240;
  const state = pruneExpiredState(await loadState(workspaceRoot, fs));
  const consent: BatchSessionConsent = {
    id: createCorrelationId('session'),
    createdAt: nowIso(),
    expiresAt: withExpiry(ttlMinutes),
    commandExecutionId: input.commandExecutionId,
    note: input.note,
  };

  const nextState: GovernanceState = {
    ...state,
    batchSessionConsent: consent,
  };
  await saveState(workspaceRoot, fs, nextState);
  return consent;
}

export async function getBatchSessionConsent(
  workspaceRoot: string,
  fs: IFileSystem,
): Promise<BatchSessionConsent | undefined> {
  const state = pruneExpiredState(await loadState(workspaceRoot, fs));
  await saveState(workspaceRoot, fs, state);
  return state.batchSessionConsent;
}

export async function clearBatchSessionConsent(
  workspaceRoot: string,
  fs: IFileSystem,
): Promise<void> {
  const state = pruneExpiredState(await loadState(workspaceRoot, fs));
  if (!state.batchSessionConsent) {
    await saveState(workspaceRoot, fs, state);
    return;
  }

  const nextState: GovernanceState = {
    ...state,
    batchSessionConsent: undefined,
  };
  await saveState(workspaceRoot, fs, nextState);
}

export async function setBranchSessionGovernance(
  workspaceRoot: string,
  fs: IFileSystem,
  input: {
    strategy: BranchResolutionStrategy;
    command: string;
    citedMentions: string[];
    sessionBranch?: string;
    sessionBranchSource?: BranchSessionSource;
  },
): Promise<BranchSessionGovernance> {
  if (input.strategy === 'session' && !input.sessionBranch) {
    throw new Error(
      'A governança de branch da sessão exige uma branch canônica resolvida antes de persistir a estratégia.',
    );
  }

  const state = pruneExpiredState(await loadState(workspaceRoot, fs));
  const createdAt = state.branchSessionGovernance?.createdAt ?? nowIso();
  const governance: BranchSessionGovernance = {
    id: state.branchSessionGovernance?.id ?? createCorrelationId('session'),
    sessionId: RUNTIME_SESSION_ID,
    strategy: input.strategy,
    command: input.command,
    createdAt,
    updatedAt: nowIso(),
    citedMentions: [...input.citedMentions],
    sessionBranch: input.sessionBranch,
    sessionBranchSource: input.sessionBranchSource,
  };

  const nextState: GovernanceState = {
    ...state,
    branchSessionGovernance: governance,
  };
  await saveState(workspaceRoot, fs, nextState);
  return governance;
}

export async function getBranchSessionGovernance(
  workspaceRoot: string,
  fs: IFileSystem,
): Promise<BranchSessionGovernance | undefined> {
  const state = pruneExpiredState(await loadState(workspaceRoot, fs));
  await saveState(workspaceRoot, fs, state);
  return state.branchSessionGovernance;
}

export async function clearBranchSessionGovernance(
  workspaceRoot: string,
  fs: IFileSystem,
): Promise<void> {
  const state = pruneExpiredState(await loadState(workspaceRoot, fs));
  if (!state.branchSessionGovernance) {
    await saveState(workspaceRoot, fs, state);
    return;
  }

  const nextState: GovernanceState = {
    ...state,
    branchSessionGovernance: undefined,
  };
  await saveState(workspaceRoot, fs, nextState);
}
