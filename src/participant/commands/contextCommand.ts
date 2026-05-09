import * as vscode from 'vscode';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { ContextManager } from '../../workflow/ContextManager';
import { emitContextualCommands, emitQuickActions, requireWorkspace } from './CommandHelpers';

export async function handleContextCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  fs: IFileSystem = vscodeFileSystem,
  workspace: IWorkspace = vscodeWorkspace,
): Promise<void> {
  const workspaceRoot = requireWorkspace(workspace, stream);
  if (!workspaceRoot) return;

  const args = request.prompt.trim();
  const cm = new ContextManager(workspaceRoot, fs);

  if (!args || args === 'list') {
    const files = await cm.list();
    if (files.length === 0) {
      stream.markdown(
        '📂 Nenhum arquivo de contexto adicionado.\n\n' +
          '**Uso:** `@speckit /context add <caminho-relativo>`\n',
      );
      emitContextualCommands(stream, [
        {
          command: '@speckit /context add src/caminho/arquivo.ts',
          description: 'adicionar primeiro arquivo ao contexto',
        },
        { command: '@speckit /context', description: 'relistar contexto ativo' },
      ]);
      emitQuickActions(stream, [{ title: '📂 Relistar Contexto', query: '@speckit /context' }]);
      return;
    }
    stream.markdown(
      `## 📂 Contexto ativo\n\n${files.length} arquivo(s) selecionados.\n\n` +
        files.map((f) => `- \`${f}\``).join('\n') +
        '\n',
    );
    emitContextualCommands(stream, [
      { command: '@speckit /context remove <caminho>', description: 'remover arquivo específico' },
      { command: '@speckit /context clear', description: 'limpar contexto por completo' },
    ]);
    emitQuickActions(stream, [{ title: '🧹 Limpar Contexto', query: '@speckit /context clear' }]);
    return;
  }

  const parts = args.split(/\s+/);
  const action = parts[0];
  const filePath = parts.slice(1).join(' ');

  if (action === 'add') {
    if (!filePath) {
      stream.markdown(
        '❌ Forneça o caminho do arquivo.\n**Exemplo:** `@speckit /context add src/auth/service.ts`\n',
      );
      emitQuickActions(stream, [{ title: '📂 Ver Contexto Atual', query: '@speckit /context' }]);
      return;
    }
    const result = await cm.add(filePath);
    switch (result) {
      case 'added':
        stream.markdown(`✅ Adicionado: \`${filePath}\`\n`);
        emitQuickActions(stream, [{ title: '📂 Ver Contexto Atual', query: '@speckit /context' }]);
        return;
      case 'already':
        stream.markdown(`ℹ️ Já está no contexto: \`${filePath}\`\n`);
        emitQuickActions(stream, [{ title: '📂 Ver Contexto Atual', query: '@speckit /context' }]);
        return;
      case 'outside':
        stream.markdown(
          '❌ Caminho inválido — não é permitido referenciar arquivos fora do workspace.\n',
        );
        emitQuickActions(stream, [{ title: '📘 Ajuda de Contexto', query: '@speckit /help' }]);
        return;
      case 'not-found':
        stream.markdown(`❌ Arquivo não encontrado: \`${filePath}\`\n`);
        emitQuickActions(stream, [{ title: '📂 Ver Contexto Atual', query: '@speckit /context' }]);
        return;
    }
  }

  if (action === 'remove') {
    if (!filePath) {
      stream.markdown('❌ Forneça o caminho do arquivo a remover.\n');
      emitQuickActions(stream, [{ title: '📂 Ver Contexto Atual', query: '@speckit /context' }]);
      return;
    }
    const removed = await cm.remove(filePath);
    if (removed) {
      stream.markdown(`✅ Removido: \`${filePath}\`\n`);
      emitQuickActions(stream, [{ title: '📂 Ver Contexto Atual', query: '@speckit /context' }]);
    } else {
      stream.markdown(`⚠️ Não encontrado no contexto: \`${filePath}\`\n`);
      emitQuickActions(stream, [{ title: '📂 Ver Contexto Atual', query: '@speckit /context' }]);
    }
    return;
  }

  if (action === 'clear') {
    await cm.clear();
    stream.markdown('✅ Contexto limpo.\n');
    emitQuickActions(stream, [{ title: '📂 Ver Contexto Atual', query: '@speckit /context' }]);
    return;
  }

  stream.markdown(
    '❌ Ação inválida.\n\n' +
      '**Uso:**\n' +
      '- `@speckit /context` — Listar arquivos\n' +
      '- `@speckit /context add <caminho>` — Adicionar arquivo\n' +
      '- `@speckit /context remove <caminho>` — Remover arquivo\n' +
      '- `@speckit /context clear` — Limpar tudo\n',
  );
  emitQuickActions(stream, [{ title: '📘 Abrir Ajuda', query: '@speckit /help' }]);
}
