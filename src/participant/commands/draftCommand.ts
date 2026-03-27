import * as vscode from 'vscode';
import * as path from 'path';
import { generateStoryElicitPrompt } from '../../generator/draft/StoryElicitGenerator';
import { generateFixElicitPrompt } from '../../generator/draft/FixElicitGenerator';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';

const FIX_KEYWORDS = /quebrad|\b(bug|erro|error|falha|falhou|broke|broken|crash|regression|regress[aã]o|corrigir|corre[cç][aã]o|n[aã]o funciona)\b/i;

export function detectDraftIntent(prompt: string): 'story' | 'fix' {
  if (/--fix\b|--bug\b/i.test(prompt)) return 'fix';
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
  const workspaceRoot = workspace.getWorkspaceRoot();
  if (!workspaceRoot) {
    stream.markdown('❌ Nenhum workspace aberto. Abra uma pasta antes de usar `/draft`.');
    return;
  }

  const roughInput = request.prompt.trim();
  if (!roughInput) {
    stream.markdown(
      '❌ Forneça uma descrição da funcionalidade ou bug.\n\n' +
      '**Exemplos:**\n' +
      '- `@speckit /draft Quero calcular comissão de vendedores baseado em eventos Kafka quando uma venda é concluída`\n' +
      '- `@speckit /draft O login OAuth2 retorna 500 após expiração do token --fix`\n',
    );
    return;
  }

  const specDir = path.join(workspaceRoot, '.speckit');
  await fs.ensureDir(specDir);

  const intent = detectDraftIntent(roughInput);

  if (intent === 'fix') {
    const existing = await workspace.listFixFiles(specDir);
    const nextId = String(existing.length + 1).padStart(3, '0');
    const fileName = 'elicit-fix.prompt.md';
    const filePath = path.join(specDir, fileName);

    const content = generateFixElicitPrompt(roughInput, nextId);
    await fs.writeFile(filePath, content);

    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);

    stream.markdown(
      `✅ Prompt de elicitação criado: \`.speckit/${fileName}\`\n\n` +
      `**Próximo passo:** O arquivo foi aberto no editor. Para iniciar a elicitação:\n\n` +
      `- **Opção A (recomendada):** Com o arquivo aberto no editor, clique no ícone **▶ Run in Copilot Chat** na barra de título → selecione **Novo Chat**\n` +
      `- **Opção B:** Abra o Copilot Chat (\`Ctrl+Alt+I\`), mude para modo **Agente**, e escreva \`#${fileName}\` no campo de mensagem\n\n` +
      `> Use **Novo Chat** para garantir contexto limpo — o agente de elicitação precisa de uma sessão dedicada.\n\n` +
      `O Copilot vai conduzir uma entrevista guiada e gerar o \`FIX-${nextId}.md\` completo.\n\n` +
      `Quando o arquivo estiver pronto, use \`@speckit /validate\` para verificar completude e gerar a configuração do Copilot.\n`,
    );
  } else {
    const existing = await workspace.listStoryFiles(specDir);
    const nextId = String(existing.length + 1).padStart(3, '0');
    const fileName = 'elicit-story.prompt.md';
    const filePath = path.join(specDir, fileName);

    const content = generateStoryElicitPrompt(roughInput, nextId);
    await fs.writeFile(filePath, content);

    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);

    stream.markdown(
      `✅ Prompt de elicitação criado: \`.speckit/${fileName}\`\n\n` +
      `**Próximo passo:** O arquivo foi aberto no editor. Para iniciar a elicitação:\n\n` +
      `- **Opção A (recomendada):** Com o arquivo aberto no editor, clique no ícone **▶ Run in Copilot Chat** na barra de título → selecione **Novo Chat**\n` +
      `- **Opção B:** Abra o Copilot Chat (\`Ctrl+Alt+I\`), mude para modo **Agente**, e escreva \`#${fileName}\` no campo de mensagem\n\n` +
      `> Use **Novo Chat** para garantir contexto limpo — o agente de elicitação precisa de uma sessão dedicada.\n\n` +
      `O Copilot vai conduzir uma entrevista guiada e gerar o \`STORY-${nextId}.md\` completo.\n\n` +
      `Quando o arquivo estiver pronto, use \`@speckit /validate\` para verificar completude e gerar a configuração do Copilot.\n`,
    );
  }
}
