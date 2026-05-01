import * as path from 'path';
import * as vscode from 'vscode';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { appendLog } from '../../generator/utils/SessionLogger';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { extractSpecType, RE_META_BLOCK } from '../../parser/BaseParser';
import { Gate, SpecStatus } from '../../story/Story';
import { parseStory } from '../../story/StoryParser';
import { validateGateTransition, validateStatusTransition } from '../../workflow/GateEnforcer';
import { gitOps, IGitOps } from '../../workflow/GitOperations';
import { requireWorkspace } from './CommandHelpers';

interface CoverageInfo {
  percent?: number;
  linesHit: number;
  linesFound: number;
}

interface MetadataPatchResult {
  content: string;
  changed: boolean;
}

type ReviewAutoAction = 'orchestrate' | 'approved' | 'changes-requested';

interface StoryTransitionSummary {
  fromGate: Gate;
  toGate: Gate;
  fromStatus: SpecStatus;
  toStatus: SpecStatus;
  changed: boolean;
  reason: string;
}

function upsertStoryMetadata(content: string, gate: Gate, status: SpecStatus): MetadataPatchResult {
  const metaMatch = content.match(RE_META_BLOCK);
  if (!metaMatch || metaMatch.index === undefined) {
    throw new Error('Bloco <!-- metadata --> não encontrado na story ativa.');
  }

  const before = content.slice(0, metaMatch.index);
  const after = content.slice(metaMatch.index + metaMatch[0].length);
  const lines = metaMatch[1].replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let gateFound = false;
  let statusFound = false;

  const nextLines = lines.map((line) => {
    if (/^\s*gate\s*:/i.test(line)) {
      gateFound = true;
      return `gate: ${gate}`;
    }
    if (/^\s*status\s*:/i.test(line)) {
      statusFound = true;
      return `status: ${status}`;
    }
    return line;
  });

  if (!gateFound) nextLines.push(`gate: ${gate}`);
  if (!statusFound) nextLines.push(`status: ${status}`);

  const normalizedLines = nextLines
    .join('\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(
      (line, idx, arr) =>
        !(idx === 0 && line.trim().length === 0) &&
        !(idx === arr.length - 1 && line.trim().length === 0),
    );

  const replacement = `<!-- metadata\n${normalizedLines.join('\n')}\n-->`;
  const nextContent = `${before}${replacement}${after}`;

  return { content: nextContent, changed: nextContent !== content };
}

function extractChangedFilesFromDiff(diffOutput: string): string[] {
  const re = /^diff --git a\/(.+?) b\/(.+)$/gm;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = re.exec(diffOutput)) !== null) {
    const candidate = (match[2] || '').trim();
    if (candidate) seen.add(candidate);
  }

  return [...seen];
}

async function collectChangedFiles(workspaceRoot: string, git: IGitOps): Promise<string[]> {
  if (git.changedFiles) {
    try {
      const againstDevelop = await git.changedFiles(workspaceRoot, 'develop...HEAD');
      if (againstDevelop.length > 0) return againstDevelop;
    } catch {
      // ignore and fallback
    }

    try {
      const againstHead = await git.changedFiles(workspaceRoot, 'HEAD');
      if (againstHead.length > 0) return againstHead;
    } catch {
      // ignore and fallback
    }
  }

  try {
    const fullDiff = await git.diff(workspaceRoot, true);
    return extractChangedFilesFromDiff(fullDiff);
  } catch {
    return [];
  }
}

function parseCoverageFromLcov(content: string): CoverageInfo {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let linesFound = 0;
  let linesHit = 0;

  for (const line of lines) {
    if (line.startsWith('LF:')) {
      linesFound += Number.parseInt(line.slice(3), 10) || 0;
      continue;
    }
    if (line.startsWith('LH:')) {
      linesHit += Number.parseInt(line.slice(3), 10) || 0;
    }
  }

  if (linesFound <= 0) return { linesFound, linesHit };
  const percent = (linesHit / linesFound) * 100;
  return { linesFound, linesHit, percent };
}

async function readCoverageEvidence(workspaceRoot: string, fs: IFileSystem): Promise<CoverageInfo> {
  const lcovPath = path.join(workspaceRoot, 'coverage', 'lcov.info');
  const exists = await fs.fileExists(lcovPath);
  if (!exists) return { linesFound: 0, linesHit: 0 };
  const content = await fs.readFile(lcovPath);
  return parseCoverageFromLcov(content);
}

function formatCoverage(coverage: CoverageInfo): string {
  if (coverage.percent === undefined) {
    return 'não disponível (lcov ausente ou inválido)';
  }
  return `${coverage.percent.toFixed(2)}% (${coverage.linesHit}/${coverage.linesFound})`;
}

function parseReviewAutoAction(prompt: string | undefined): {
  action: ReviewAutoAction;
  error?: string;
} {
  const tokens = (prompt ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);

  const approved = tokens.includes('--approved') || tokens.includes('--approve');
  const changesRequested =
    tokens.includes('--changes-requested') ||
    tokens.includes('--changes') ||
    tokens.includes('--rework');

  if (approved && changesRequested) {
    return {
      action: 'orchestrate',
      error:
        'Flags conflitantes: use apenas uma entre `--approved` e `--changes-requested` no comando `/review-auto`.',
    };
  }

  if (approved) return { action: 'approved' };
  if (changesRequested) return { action: 'changes-requested' };
  return { action: 'orchestrate' };
}

function applyStoryTransition(
  content: string,
  fromGate: Gate,
  fromStatus: SpecStatus,
  toGate: Gate,
  toStatus: SpecStatus,
  reason: string,
): { patch: MetadataPatchResult; summary: StoryTransitionSummary } {
  if (fromGate !== toGate) {
    const gateValidation = validateGateTransition(fromGate, toGate);
    if (!gateValidation.allowed) {
      throw new Error(
        `Transição automática de gate bloqueada (${fromGate} → ${toGate}): ${gateValidation.reason ?? 'motivo não informado'}`,
      );
    }
  }

  if (fromStatus !== toStatus) {
    const statusValidation = validateStatusTransition(fromStatus, toStatus);
    if (!statusValidation.allowed) {
      throw new Error(
        `Transição automática de status bloqueada (${fromStatus} → ${toStatus}): ${statusValidation.reason ?? 'motivo não informado'}`,
      );
    }
  }

  const patch = upsertStoryMetadata(content, toGate, toStatus);
  return {
    patch,
    summary: {
      fromGate,
      toGate,
      fromStatus,
      toStatus,
      changed: patch.changed,
      reason,
    },
  };
}

function formatTransitionMarkdown(summary: StoryTransitionSummary): string {
  if (!summary.changed) {
    return (
      `### 🚪 Transição de Gate/Status\n` +
      `- ℹ️ Sem mudança persistida (gate/status já estavam no estado esperado).\n` +
      `- Motivo: ${summary.reason}\n`
    );
  }

  return (
    `### 🚪 Transição de Gate/Status\n` +
    `| Campo | Antes | Depois |\n` +
    `| --- | --- | --- |\n` +
    `| Gate | \`${summary.fromGate}\` | \`${summary.toGate}\` |\n` +
    `| Status | \`${summary.fromStatus}\` | \`${summary.toStatus}\` |\n` +
    `\n` +
    `**Motivo:** ${summary.reason}\n`
  );
}

export async function handleReviewAutoCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  workspace: IWorkspace = vscodeWorkspace,
  fs: IFileSystem = vscodeFileSystem,
  git: IGitOps = gitOps,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const activeSpecPath = await workspace.getActiveSpecPath();
  if (!activeSpecPath) {
    stream.markdown(
      '❌ Nenhuma spec ativa encontrada. Execute `@speckit /status` e selecione uma story em andamento.\n',
    );
    return;
  }

  const content = await fs.readFile(activeSpecPath);
  const specType = extractSpecType(content);
  if (specType !== 'story') {
    stream.markdown('❌ `/review-auto` está disponível apenas para Story no momento.\n');
    return;
  }

  const story = parseStory(content);
  const parsedAction = parseReviewAutoAction(request.prompt);

  if (parsedAction.error) {
    stream.markdown(
      `❌ ${parsedAction.error}\n\n` +
        '**Uso suportado:**\n' +
        '- `@speckit /review-auto` (orquestra Gate 2 → Gate 3 e revisão automática)\n' +
        '- `@speckit /review-auto --changes-requested` (Gate 3 → Gate 2 para retrabalho)\n' +
        '- `@speckit /review-auto --approved` (Gate 3 → Gate 4 com status done)\n',
    );
    return;
  }

  if (story.metadata.status === 'done' || story.metadata.status === 'cancelled') {
    stream.markdown(
      `❌ Story \`${story.metadata.id}\` já está em status terminal (\`${story.metadata.status}\`). Revisão automática não aplicável.\n`,
    );
    return;
  }

  if (parsedAction.action === 'approved') {
    if (story.metadata.gate < 3) {
      stream.markdown(
        `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. O encerramento automático exige Gate 3 com revisão concluída.\n`,
      );
      return;
    }

    try {
      const { patch, summary } = applyStoryTransition(
        content,
        story.metadata.gate,
        story.metadata.status,
        4,
        'done',
        'Veredito APROVADO confirmado no Gate 3.',
      );
      if (patch.changed) {
        await fs.writeFile(activeSpecPath, patch.content);
      }

      await appendLog(
        workspaceRoot,
        {
          command: '/review-auto --approved',
          specId: story.metadata.id,
          specTitle: story.metadata.title,
          gate: 4,
          outcome: '✅ Veredito APROVADO — story encerrada no Gate 4',
          detail: `Gate: ${summary.fromGate} -> ${summary.toGate}\nStatus: ${summary.fromStatus} -> ${summary.toStatus}`,
        },
        fs,
      );

      stream.markdown(
        `## ✅ Encerramento Orquestrado — STORY-${story.metadata.id}\n\n` +
          `${formatTransitionMarkdown(summary)}\n\n` +
          '### Próximo passo\n' +
          `- Faça o commit do metadata da story: \`git add .speckit/STORY-${story.metadata.id}.md\`\n` +
          `- Conclua com: \`git commit -m "chore(${story.metadata.id}): encerra story no speckit"\`\n`,
      );
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`❌ ${msg}\n`);
      return;
    }
  }

  if (parsedAction.action === 'changes-requested') {
    if (story.metadata.gate < 3) {
      stream.markdown(
        `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. O retorno para retrabalho exige Gate 3.\n`,
      );
      return;
    }

    try {
      const { patch, summary } = applyStoryTransition(
        content,
        story.metadata.gate,
        story.metadata.status,
        2,
        'in-progress',
        'Veredito ALTERAÇÕES SOLICITADAS no Gate 3.',
      );
      if (patch.changed) {
        await fs.writeFile(activeSpecPath, patch.content);
      }

      await appendLog(
        workspaceRoot,
        {
          command: '/review-auto --changes-requested',
          specId: story.metadata.id,
          specTitle: story.metadata.title,
          gate: 2,
          outcome: '🔄 Alterações solicitadas — retorno para Gate 2 (implementação)',
          detail: `Gate: ${summary.fromGate} -> ${summary.toGate}\nStatus: ${summary.fromStatus} -> ${summary.toStatus}`,
        },
        fs,
      );

      stream.markdown(
        `## 🔄 Retorno Orquestrado para Retrabalho — STORY-${story.metadata.id}\n\n` +
          `${formatTransitionMarkdown(summary)}\n\n` +
          '### Próximo passo\n' +
          '- Retorne ao modo implementador e aplique apenas os FIXes aprovados no plano de revisão.\n' +
          '- Após concluir os FIXes e revalidar testes/cobertura, execute `@speckit /review-auto` para novo ciclo de revisão.\n',
      );
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`❌ ${msg}\n`);
      return;
    }
  }

  if (story.metadata.gate < 2) {
    stream.markdown(
      `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. A revisão automática exige conclusão prévia dos Gates 0-2.\n`,
    );
    return;
  }

  if (story.metadata.gate > 3) {
    stream.markdown(
      `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. Para novos ciclos de revisão, retorne antes ao Gate 2 via fluxo de correções.\n`,
    );
    return;
  }

  let transitionSummary: StoryTransitionSummary = {
    fromGate: story.metadata.gate,
    toGate: story.metadata.gate,
    fromStatus: story.metadata.status,
    toStatus: story.metadata.status,
    changed: false,
    reason: 'Story já estava em modo de revisão (gate/status preservados).',
  };

  if (story.metadata.gate === 2 || story.metadata.status !== 'review') {
    try {
      const transition = applyStoryTransition(
        content,
        story.metadata.gate,
        story.metadata.status,
        3,
        'review',
        'Handoff implementador → revisor orquestrado automaticamente.',
      );
      transitionSummary = transition.summary;
      if (transition.patch.changed) {
        await fs.writeFile(activeSpecPath, transition.patch.content);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`❌ ${msg}\n`);
      return;
    }
  }

  const changedFiles = await collectChangedFiles(workspaceRoot, git);
  const coverage = await readCoverageEvidence(workspaceRoot, fs);

  const blockers: string[] = [];
  if (changedFiles.length === 0) {
    blockers.push(
      'Nenhum arquivo foi detectado automaticamente no diff para revisão. Valide o range da branch (ex.: develop...HEAD).',
    );
  }
  if (coverage.percent === undefined) {
    blockers.push(
      'Evidência de cobertura não encontrada (coverage/lcov.info ausente ou inválido).',
    );
  } else if (coverage.percent < 80) {
    blockers.push(
      `Cobertura abaixo do mínimo obrigatório: ${coverage.percent.toFixed(2)}% < 80.00%.`,
    );
  }

  const filesSection =
    changedFiles.length > 0
      ? changedFiles.map((f) => `- \`${f}\``).join('\n')
      : '- (nenhum arquivo detectado automaticamente)';

  const blockerSection =
    blockers.length > 0
      ? blockers.map((b) => `- ❌ ${b}`).join('\n')
      : '- ✅ Nenhum bloqueio automático detectado';

  const verdict =
    blockers.length > 0
      ? 'ALTERAÇÕES SOLICITADAS (bloqueios automáticos)'
      : 'REVISÃO GATE 3 EXECUTADA (sem bloqueios automáticos)';

  await appendLog(
    workspaceRoot,
    {
      command: '/review-auto',
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      gate: 3,
      outcome: `✅ ${verdict}`,
      detail:
        `Gate: ${transitionSummary.fromGate} -> ${transitionSummary.toGate}\n` +
        `Status: ${transitionSummary.fromStatus} -> ${transitionSummary.toStatus}\n` +
        `Arquivos detectados: ${changedFiles.length}\n` +
        `Cobertura: ${formatCoverage(coverage)}\n` +
        `Bloqueios: ${blockers.length}`,
    },
    fs,
  );

  stream.markdown(
    `## ✅ Revisão Orquestrada — STORY-${story.metadata.id}\n\n` +
      `${formatTransitionMarkdown(transitionSummary)}\n\n` +
      `### Evidências coletadas\n` +
      `- Arquivos detectados para revisão: ${changedFiles.length}\n` +
      `- Cobertura detectada: ${formatCoverage(coverage)}\n\n` +
      `**Arquivos candidatos à revisão**\n` +
      `${filesSection}\n\n` +
      `### Guardrails executados (Gate 3)\n` +
      `- Funcionalidade vs critérios de aceite\n` +
      `- Arquitetura e fronteiras\n` +
      `- Qualidade de código e testes\n` +
      `- Segurança e observabilidade\n` +
      `- NFR e DoD\n\n` +
      `### Bloqueios automáticos\n` +
      `${blockerSection}\n\n` +
      `**Veredito orquestrado:** ${verdict}\n\n` +
      `> Próximo passo obrigatório: no mesmo fluxo do chat, emita o checklist completo do Gate 3 com evidências por item e decisão final (APROVADO ou ALTERAÇÕES SOLICITADAS).\n`,
  );
}
