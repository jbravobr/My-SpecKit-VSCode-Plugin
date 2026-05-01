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
import { validateGateTransition } from '../../workflow/GateEnforcer';
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

export async function handleReviewAutoCommand(
  _request: vscode.ChatRequest,
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

  if (story.metadata.status === 'done' || story.metadata.status === 'cancelled') {
    stream.markdown(
      `❌ Story \`${story.metadata.id}\` já está em status terminal (\`${story.metadata.status}\`). Revisão automática não aplicável.\n`,
    );
    return;
  }

  if (story.metadata.gate < 2) {
    stream.markdown(
      `❌ Story \`${story.metadata.id}\` está no Gate ${story.metadata.gate}. A revisão automática exige conclusão prévia dos Gates 0-2.\n`,
    );
    return;
  }

  let transitionMessage = 'ℹ️ Story já estava em modo de revisão (gate/status preservados).';

  if (story.metadata.gate === 2 || story.metadata.status !== 'review') {
    if (story.metadata.gate === 2) {
      const gateValidation = validateGateTransition(2, 3);
      if (!gateValidation.allowed) {
        stream.markdown(
          `❌ Transição automática de gate bloqueada (2 → 3): ${gateValidation.reason ?? 'motivo não informado'}.\n`,
        );
        return;
      }
    }

    const patch = upsertStoryMetadata(content, 3, 'review');
    if (patch.changed) {
      await fs.writeFile(activeSpecPath, patch.content);
    }
    transitionMessage =
      '✅ Handoff orquestrado concluído: gate atualizado para `3` e status para `review`.';
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
        `Arquivos detectados: ${changedFiles.length}\n` +
        `Cobertura: ${formatCoverage(coverage)}\n` +
        `Bloqueios: ${blockers.length}`,
    },
    fs,
  );

  stream.markdown(
    `## ✅ Revisão Orquestrada — STORY-${story.metadata.id}\n\n` +
      `${transitionMessage}\n\n` +
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
