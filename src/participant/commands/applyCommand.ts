import * as vscode from 'vscode';
import { parseStory } from '../../story/StoryParser';
import { validateStory } from '../../story/StoryValidator';
import { generateCopilotConfig } from '../../generator/CopilotConfigGenerator';
import { parseFix } from '../../fix/FixParser';
import { validateFix } from '../../fix/FixValidator';
import { generateFixCopilotConfig } from '../../generator/FixCopilotConfigGenerator';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';

function extractSpecType(content: string): 'story' | 'fix' {
  const metaMatch = /<!--\s*metadata\s*([\s\S]*?)-->/.exec(content);
  if (!metaMatch) return 'story';
  const typeMatch = /^type:\s*(.+)$/m.exec(metaMatch[1]);
  return typeMatch?.[1]?.trim() === 'fix' ? 'fix' : 'story';
}

export async function handleApplyCommand(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = workspace.getWorkspaceRoot();
  if (!workspaceRoot) {
    stream.markdown('❌ Nenhum workspace aberto.');
    return;
  }

  const specPath = await workspace.getActiveSpecPath();
  if (!specPath) {
    stream.markdown('❌ Nenhuma spec encontrada em `.speckit/`. Use `/new` ou `/fix` para criar uma.');
    return;
  }

  const content = await fs.readFile(specPath);
  const specType = extractSpecType(content);

  if (specType === 'fix') {
    const fix = parseFix(content);
    const result = validateFix(fix);

    if (!result.valid) {
      const gapLines = result.gaps
        .map(g => `- **[${g.section}]** \`${g.field}\`: ${g.message}`)
        .join('\n');
      stream.markdown(
        `⚠️ Fix incompleto — corrija as lacunas antes de aplicar:\n\n${gapLines}\n\n` +
        'Execute `/validate` para ver o status completo.\n',
      );
      return;
    }

    stream.markdown('⏳ Detectando stack e gerando arquivos de configuração...\n');
    try {
      const files = await generateFixCopilotConfig(workspaceRoot, fix, fs, workspace);
      const fileList = files.map(f => `- \`${f}\``).join('\n');
      stream.markdown(
        `✅ **Configuração aplicada! ${files.length} arquivo(s) gerado(s):**\n\n${fileList}\n\n` +
        '---\n\n' +
        '▶ **Próximo passo — iniciar a correção:**\n\n' +
        '1. Abra um novo **Copilot Chat**\n' +
        '2. Selecione o modo **Agente**\n' +
        '3. Digite `/fix-implement` — o agente carregará o plano completo\n\n' +
        'O prompt está em `.github/prompts/fix-implement.prompt.md`.\n',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`❌ **Erro ao detectar stack:** ${msg}\n`);
    }
    return;
  }

  // Story flow
  const story = parseStory(content);
  const result = validateStory(story);

  if (!result.valid) {
    const gapLines = result.gaps
      .map(g => `- **[${g.section}]** \`${g.field}\`: ${g.message}`)
      .join('\n');
    stream.markdown(
      `⚠️ História incompleta — corrija as lacunas antes de aplicar:\n\n${gapLines}\n\n` +
      'Execute `/validate` para ver o status completo.\n',
    );
    return;
  }

  stream.markdown('⏳ Gerando arquivos de configuração do Copilot...\n');
  const files = await generateCopilotConfig(workspaceRoot, story, fs);
  const fileList = files.map(f => `- \`${f}\``).join('\n');
  stream.markdown(
    `✅ **Configuração aplicada! ${files.length} arquivo(s) gerado(s):**\n\n${fileList}\n\n` +
    '---\n\n' +
    '▶ **Próximo passo — iniciar a implementação:**\n\n' +
    '1. Abra um novo **Copilot Chat**\n' +
    '2. Selecione o modo **Agente**\n' +
    '3. Digite `/implement` — o agente carregará o plano completo\n\n' +
    'O prompt está em `.github/prompts/implement.prompt.md`.\n',
  );
}
