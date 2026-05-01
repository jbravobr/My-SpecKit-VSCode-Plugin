import * as vscode from 'vscode';
import { parseFix } from '../../fix/FixParser';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { appendLog } from '../../generator/utils/SessionLogger';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { extractSpecType } from '../../parser/BaseParser';
import { parseStory } from '../../story/StoryParser';
import { gitOps, IGitOps } from '../../workflow/GitOperations';
import { requireWorkspace } from './CommandHelpers';

interface ActiveSpecCommitContext {
  specType?: 'story' | 'fix';
  specId?: string;
  gate?: number;
}

async function resolveActiveSpecCommitContext(
  workspace: IWorkspace,
  fs: IFileSystem,
): Promise<ActiveSpecCommitContext> {
  const activeSpecPath = await workspace.getActiveSpecPath();
  if (!activeSpecPath) return {};

  try {
    const content = await fs.readFile(activeSpecPath);
    const specType = extractSpecType(content);

    if (specType === 'fix') {
      const fix = parseFix(content);
      return { specType: 'fix', specId: fix.metadata.id, gate: fix.metadata.gate };
    }

    const story = parseStory(content);
    return { specType: 'story', specId: story.metadata.id, gate: story.metadata.gate };
  } catch {
    return {};
  }
}

function deriveAutoCommitMessage(ctx: ActiveSpecCommitContext): string | undefined {
  if (!ctx.specId) return undefined;

  if (ctx.gate === 2) return `test(${ctx.specId}): validações do gate 2`;
  if (ctx.gate === 3) return `fix(${ctx.specId}): ajustes pós-revisão`;
  if (ctx.gate === 4) return `chore(${ctx.specId}): fechamento de spec`;

  if (ctx.specType === 'fix') return `fix(${ctx.specId}): implementação guiada`;
  if (ctx.specType === 'story') return `feat(${ctx.specId}): implementação guiada`;

  return `chore(${ctx.specId}): commit automático speckit`;
}

export async function handleCommitCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  workspace: IWorkspace = vscodeWorkspace,
  fs: IFileSystem = vscodeFileSystem,
  git: IGitOps = gitOps,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  let message = request.prompt.trim();
  if (!message) {
    const autoContext = await resolveActiveSpecCommitContext(workspace, fs);
    const autoMessage = deriveAutoCommitMessage(autoContext);
    if (!autoMessage) {
      stream.markdown(
        '❌ Forneça uma mensagem de commit.\n\n' +
          '**Exemplo:** `@speckit /commit refactor: extrair validação de gate`\n',
      );
      return;
    }

    message = autoMessage;
    stream.markdown(`ℹ️ Mensagem não informada. Usando padrão automático: \`${message}\`.\n\n`);
  }

  try {
    const isRepository = await git.isRepository(workspaceRoot);
    if (!isRepository) {
      await git.init(workspaceRoot);
      stream.markdown('ℹ️ Repositório Git não encontrado. `git init` executado no workspace.\n\n');
    }

    const hasChanges = await git.hasChanges(workspaceRoot);
    if (!hasChanges) {
      stream.markdown('✅ Nada para commitar — working tree limpa.\n');
      return;
    }

    const fullMessage = message.startsWith('speckit: ') ? message : `speckit: ${message}`;
    const output = await git.commit(workspaceRoot, fullMessage);

    await appendLog(
      workspaceRoot,
      {
        command: '/commit',
        outcome: `✅ Commit realizado — ${fullMessage}`,
      },
      fs,
    );

    stream.markdown(`✅ **Commit realizado:**\n\n\`\`\`\n${output.trim()}\n\`\`\`\n`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`❌ **Erro ao executar git commit:** ${msg}\n`);
  }
}
