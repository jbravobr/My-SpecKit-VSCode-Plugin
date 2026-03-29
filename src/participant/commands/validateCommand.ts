import * as vscode from 'vscode';
import * as path from 'path';
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
import { appendLog } from '../../generator/utils/SessionLogger';
import { checkEnvironment, formatEnvCheckInline } from '../../generator/utils/EnvironmentChecker';
import { TechStackDetection } from '../../fix/Fix';

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
    const gapPromptContent = generateGapFillingPrompt(story, result.gaps);
    const gapPromptPath = path.join(workspaceRoot, '.speckit', 'gap-fill.prompt.md');
    await fs.writeFile(gapPromptPath, gapPromptContent);
    const doc = await vscode.workspace.openTextDocument(gapPromptPath);
    await vscode.window.showTextDocument(doc);

    await appendLog(workspaceRoot, {
      command: '/validate',
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      outcome: `⚠️ Inválida — ${result.gaps.length} lacuna(s)`,
      detail: result.gaps.map(g => `- [${g.section}] ${g.field}: ${g.message}`).join('\n'),
    }, fs);

    stream.markdown(
      `⚠️ **História incompleta — ${result.gaps.length} lacuna(s) encontrada(s)**\n\n` +
      `**Status do DoR:**\n${dorLines}\n\n` +
      '---\n\n' +
      `✅ Arquivo de preenchimento criado: \`.speckit/gap-fill.prompt.md\`\n\n` +
      `**Próximo passo:** Execute o arquivo no Copilot Agent para preencher as lacunas:\n\n` +
      `- **Opção A (recomendada):** Com o arquivo aberto no editor, clique no ícone **▶ Run in Copilot Chat** na barra de título → selecione **Novo Chat**\n` +
      `- **Opção B:** Abra o Copilot Chat (\`Ctrl+Alt+I\`), mude para modo **Agente**, e escreva \`#gap-fill.prompt.md\` no campo de mensagem\n\n` +
      `Após preencher todas as lacunas, volte ao chat do **@speckit** e execute \`@speckit /validate\` para revalidar.\n`,
    );
    return;
  }

  stream.markdown(`✅ **DoR atingido** — história válida.\n\n**Status do DoR:**\n${dorLines}\n\n`);
  stream.markdown('⏳ Gerando arquivos de configuração do Copilot...\n');
  const files = await generateCopilotConfig(workspaceRoot, story, fs);
  const fileList = files.map(f => `- \`${f}\``).join('\n');

  await appendLog(workspaceRoot, {
    command: '/validate',
    specId: story.metadata.id,
    specTitle: story.metadata.title,
    outcome: `✅ Válida — ${files.length} arquivo(s) gerado(s)`,
    detail: files.map(f => `- ${f}`).join('\n'),
  }, fs);

  stream.markdown(`✅ **${files.length} arquivo(s) gerado(s):**\n\n${fileList}\n\n---\n\n`);

  const storyLang = story.technicalSpec.language as TechStackDetection['language'] | '';
  if (storyLang) {
    const envReport = checkEnvironment({ language: storyLang } as TechStackDetection);
    const envLine = formatEnvCheckInline(envReport);
    if (envLine) {
      stream.markdown(envLine);
    }
  }

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
    const gapPromptContent = generateFixGapFillingPrompt(fix, result.gaps);
    const gapPromptPath = path.join(workspaceRoot, '.speckit', 'gap-fill.prompt.md');
    await fs.writeFile(gapPromptPath, gapPromptContent);
    const doc = await vscode.workspace.openTextDocument(gapPromptPath);
    await vscode.window.showTextDocument(doc);

    await appendLog(workspaceRoot, {
      command: '/validate',
      specId: fix.metadata.id,
      specTitle: fix.metadata.title,
      outcome: `⚠️ Fix inválido — ${result.gaps.length} lacuna(s)`,
      detail: result.gaps.map(g => `- [${g.section}] ${g.field}: ${g.message}`).join('\n'),
    }, fs);

    stream.markdown(
      `⚠️ **Fix incompleto — ${result.gaps.length} lacuna(s) encontrada(s)**\n\n---\n\n` +
      `✅ Arquivo de preenchimento criado: \`.speckit/gap-fill.prompt.md\`\n\n` +
      `**Próximo passo:** Execute o arquivo no Copilot Agent para preencher as lacunas:\n\n` +
      `- **Opção A (recomendada):** Com o arquivo aberto no editor, clique no ícone **▶ Run in Copilot Chat** na barra de título → selecione **Novo Chat**\n` +
      `- **Opção B:** Abra o Copilot Chat (\`Ctrl+Alt+I\`), mude para modo **Agente**, e escreva \`#gap-fill.prompt.md\` no campo de mensagem\n\n` +
      `Após preencher todas as lacunas, volte ao chat do **@speckit** e execute \`@speckit /validate\` para revalidar.\n`,
    );
    return;
  }

  stream.markdown(`✅ **Fix válido** — \`.speckit/${specPath.split(/[\\/]/).pop()}\`\n\n`);
  stream.markdown('⏳ Detectando stack e gerando arquivos de configuração...\n');

  try {
    const files = await generateFixCopilotConfig(workspaceRoot, fix, fs, workspace);
    const fileList = files.map(f => `- \`${f}\``).join('\n');

    await appendLog(workspaceRoot, {
      command: '/validate',
      specId: fix.metadata.id,
      specTitle: fix.metadata.title,
      outcome: `✅ Fix válido — ${files.length} arquivo(s) gerado(s)`,
      detail: files.map(f => `- ${f}`).join('\n'),
    }, fs);

    stream.markdown(`✅ **${files.length} arquivo(s) gerado(s):**\n\n${fileList}\n\n---\n\n`);

    try {
      const detectedStack = await workspace.detectTechStack();
      const envReport = checkEnvironment(detectedStack);
      const envLine = formatEnvCheckInline(envReport);
      if (envLine) {
        stream.markdown(envLine);
      }
    } catch {
      // stack already validated during config generation — skip env check silently
    }
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
