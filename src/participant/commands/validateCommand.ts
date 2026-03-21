import * as vscode from 'vscode';
import { parseStory } from '../../story/StoryParser';
import { validateStory } from '../../story/StoryValidator';
import { generateGapFillingPrompt } from '../../generator/story/PromptsGenerator';
import { generateCopilotConfig } from '../../generator/CopilotConfigGenerator';
import { parseFix } from '../../fix/FixParser';
import { validateFix } from '../../fix/FixValidator';
import { generateFixGapFillingPrompt } from '../../generator/fix/FixPromptsGenerator';
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

export async function handleValidateCommand(
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
    await validateFix_(workspaceRoot, specPath, content, stream, fs, workspace);
  } else {
    await validateStory_(workspaceRoot, content, stream, fs, workspace);
  }
}

async function validateStory_(
  workspaceRoot: string,
  content: string,
  stream: vscode.ChatResponseStream,
  fs: IFileSystem,
  _workspace: IWorkspace,
): Promise<void> {
  const story = parseStory(content);
  const result = validateStory(story);

  const dorLines = result.dorStatus
    .map(d => `- [${d.checked ? 'x' : ' '}] ${d.criterion}`)
    .join('\n');

  if (!result.valid) {
    stream.markdown(
      `⚠️ **História incompleta — ${result.gaps.length} lacuna(s) encontrada(s)**\n\n` +
      `**Status do DoR:**\n${dorLines}\n\n` +
      '---\n\n',
    );
    stream.markdown(generateGapFillingPrompt(story, result.gaps));
    return;
  }

  stream.markdown(`✅ **DoR atingido** — história válida.\n\n**Status do DoR:**\n${dorLines}\n\n`);
  stream.markdown('⏳ Gerando arquivos de configuração do Copilot...\n');
  const files = await generateCopilotConfig(workspaceRoot, story, fs);
  const fileList = files.map(f => `- \`${f}\``).join('\n');
  stream.markdown(`✅ **${files.length} arquivo(s) gerado(s):**\n\n${fileList}\n\n---\n\n`);

  stream.markdown(
    '▶ **Fluxo de implementação — do início ao código pronto:**\n\n' +
    '**Sessão A — Implementação (portões 0–2):**\n' +
    '1. Abra um novo **Copilot Chat**\n' +
    '2. Selecione o modo **Agente**\n' +
    '3. Digite `/implement` — o agente conduz: alinhamento → implementação → testes\n\n' +
    '**Sessão B — Revisão independente (portões 3–4):**\n' +
    '4. Ao concluir a Sessão A, execute `@speckit /review`\n' +
    '5. Abra um novo **Copilot Chat**\n' +
    '6. Selecione o modo **Agente**\n' +
    '7. Digite `/review` — o agente revisa e valida a entrega\n\n' +
    'Prompts em `.github/prompts/`.\n',
  );
}

async function validateFix_(
  workspaceRoot: string,
  specPath: string,
  content: string,
  stream: vscode.ChatResponseStream,
  fs: IFileSystem,
  workspace: IWorkspace,
): Promise<void> {
  const fix = parseFix(content);
  const result = validateFix(fix);

  if (!result.valid) {
    stream.markdown(
      `⚠️ **Fix incompleto — ${result.gaps.length} lacuna(s) encontrada(s)**\n\n---\n\n`,
    );
    stream.markdown(generateFixGapFillingPrompt(fix, result.gaps));
    return;
  }

  stream.markdown(`✅ **Fix válido** — \`.speckit/${specPath.split(/[\\/]/).pop()}\`\n\n`);
  stream.markdown('⏳ Detectando stack e gerando arquivos de configuração...\n');

  try {
    const files = await generateFixCopilotConfig(workspaceRoot, fix, fs, workspace);
    const fileList = files.map(f => `- \`${f}\``).join('\n');
    stream.markdown(`✅ **${files.length} arquivo(s) gerado(s):**\n\n${fileList}\n\n---\n\n`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`❌ **Erro ao detectar stack:** ${msg}\n`);
    return;
  }

  stream.markdown(
    '▶ **Fluxo de correção:**\n\n' +
    '**Sessão A — Implementação (portões 0–2):**\n' +
    '1. Abra um novo **Copilot Chat**\n' +
    '2. Selecione o modo **Agente**\n' +
    '3. Digite `/fix-implement` — investigação → correção → testes de regressão\n\n' +
    '**Sessão B — Revisão independente (portões 3–4):**\n' +
    '4. Ao concluir a Sessão A, execute `@speckit /review`\n' +
    '5. Abra um novo **Copilot Chat**\n' +
    '6. Selecione o modo **Agente**\n' +
    '7. Digite `/fix-review` — revisão e encerramento do fix\n\n' +
    'Prompts em `.github/prompts/`.\n',
  );
}
