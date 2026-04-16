import * as path from 'path';
import * as vscode from 'vscode';
import { loadWorkspaceDefaults } from '../../config/WorkspaceDefaults';
import { generateFixElicitPrompt } from '../../generator/draft/FixElicitGenerator';
import { generateStoryElicitPrompt } from '../../generator/draft/StoryElicitGenerator';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { appendLog } from '../../generator/utils/SessionLogger';
import { generateFixId, generateStoryId } from '../../generator/utils/SpecIdGenerator';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { SpecType } from '../../story/Story';
import { TraceabilityManager } from '../../workflow/TraceabilityManager';
import { handleCommandError, requireWorkspace } from './CommandHelpers';

const FIX_KEYWORDS =
  /\bquebrad|\b(bug|erro|error|falha|falhou|broke|broken|crash|regression|regress[aã]o|corrigir|corre[cç][aã]o|n[aã]o funciona)\b/i;

export function detectDraftIntent(prompt: string): 'story' | 'fix' | 'refactoring' | 'spike' {
  if (/--fix\b|--bug\b/i.test(prompt)) return 'fix';
  if (/--refactoring\b|--refactor\b/i.test(prompt)) return 'refactoring';
  if (/--spike\b|--poc\b/i.test(prompt)) return 'spike';
  if (FIX_KEYWORDS.test(prompt)) return 'fix';
  return 'story';
}

export async function handleDraftCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const roughInput = request.prompt.trim();
  if (!roughInput) {
    stream.markdown(
      '❌ Forneça uma descrição da funcionalidade ou bug.\n\n' +
        '**Exemplos:**\n' +
        '- `@speckit /draft Quero calcular comissão de vendedores baseado em eventos Kafka quando uma venda é concluída`\n' +
        '- `@speckit /draft O login OAuth2 retorna 500 após expiração do token --fix`\n' +
        '- `@speckit /draft Migrar módulo de pagamento para hexagonal --refactoring`\n' +
        '- `@speckit /draft Avaliar viabilidade de SSR com Next.js --spike`\n',
    );
    return;
  }

  const specDir = path.join(workspaceRoot, '.speckit');
  await fs.ensureDir(specDir);

  const intent = detectDraftIntent(roughInput);
  const cleanInput = roughInput
    .replace(/\s*--(fix|bug|refactoring|refactor|spike|poc)\b/gi, '')
    .trim();

  const defaults = await loadWorkspaceDefaults(workspaceRoot, fs);

  if (intent === 'fix') {
    const existing = await workspace.listFixFiles(specDir);
    const specId = generateFixId(workspaceRoot, existing);
    const fileName = `elicit-fix-${specId}.prompt.md`;
    const filePath = path.join(specDir, fileName);

    const content = generateFixElicitPrompt(cleanInput, specId);
    try {
      await fs.writeFile(filePath, content);
    } catch (err: unknown) {
      handleCommandError(err, stream, 'Erro ao salvar o prompt de elicitação');
      return;
    }

    await appendLog(
      workspaceRoot,
      {
        command: '/draft',
        specId,
        outcome: `✅ Elicitação de fix iniciada — ${specId}`,
        detail: `Input: ${roughInput.slice(0, 120)}${roughInput.length > 120 ? '…' : ''}`,
      },
      fs,
    );

    try {
      const tracer = new TraceabilityManager(workspaceRoot, fs);
      await tracer.record(specId, 'fix', {
        type: 'file',
        description: 'elicit prompt created',
        data: { specId, fileName, intent },
      });
    } catch {
      // Traceability should never break the main flow
    }

    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);

    stream.markdown(
      `✅ Prompt de elicitação criado: \`.speckit/${fileName}\`\n\n` +
        `**Próximo passo:** O arquivo foi aberto no editor. Para iniciar a elicitação:\n\n` +
        `- **Opção A (recomendada):** Com o arquivo aberto no editor, clique no ícone **▶ Run in Copilot Chat** na barra de título → selecione **Novo Chat**\n` +
        `- **Opção B:** Abra o Copilot Chat (\`Ctrl+Alt+I\`), mude para modo **Agente**, e escreva \`#${fileName}\` no campo de mensagem\n\n` +
        `> Use **Novo Chat** para garantir contexto limpo — o agente de elicitação precisa de uma sessão dedicada.\n\n` +
        `O Copilot vai conduzir uma entrevista guiada e gerar o \`${specId}.md\` completo.\n\n` +
        `Quando o arquivo estiver pronto, use \`@speckit /validate\` para verificar completude e gerar a configuração do Copilot.\n`,
    );
  } else {
    const specType: SpecType =
      intent === 'refactoring' ? 'refactoring' : intent === 'spike' ? 'spike' : 'story';
    const existing = await workspace.listStoryFiles(specDir);
    const specId = generateStoryId(workspaceRoot, existing);
    const fileName = `elicit-story-${specId}.prompt.md`;
    const filePath = path.join(specDir, fileName);

    const content = generateStoryElicitPrompt(cleanInput, specId, specType, defaults);
    try {
      await fs.writeFile(filePath, content);
    } catch (err: unknown) {
      handleCommandError(err, stream, 'Erro ao salvar o prompt de elicitação');
      return;
    }

    await appendLog(
      workspaceRoot,
      {
        command: '/draft',
        specId,
        outcome: `✅ Elicitação de story iniciada — ${specId}`,
        detail: `Input: ${roughInput.slice(0, 120)}${roughInput.length > 120 ? '…' : ''}`,
      },
      fs,
    );

    try {
      const tracer = new TraceabilityManager(workspaceRoot, fs);
      await tracer.record(specId, 'story', {
        type: 'file',
        description: 'elicit prompt created',
        data: { specId, fileName, intent },
      });
    } catch {
      // Traceability should never break the main flow
    }

    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);

    stream.markdown(
      `✅ Prompt de elicitação criado: \`.speckit/${fileName}\`\n\n` +
        `**Próximo passo:** O arquivo foi aberto no editor. Para iniciar a elicitação:\n\n` +
        `- **Opção A (recomendada):** Com o arquivo aberto no editor, clique no ícone **▶ Run in Copilot Chat** na barra de título → selecione **Novo Chat**\n` +
        `- **Opção B:** Abra o Copilot Chat (\`Ctrl+Alt+I\`), mude para modo **Agente**, e escreva \`#${fileName}\` no campo de mensagem\n\n` +
        `> Use **Novo Chat** para garantir contexto limpo — o agente de elicitação precisa de uma sessão dedicada.\n\n` +
        `O Copilot vai conduzir uma entrevista guiada e gerar o \`${specId}.md\` completo.\n\n` +
        `Quando o arquivo estiver pronto, use \`@speckit /validate\` para verificar completude e gerar a configuração do Copilot.\n`,
    );
  }
}
