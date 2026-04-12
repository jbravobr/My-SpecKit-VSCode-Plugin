import * as path from 'path';
import * as vscode from 'vscode';
import { parseFix } from '../../fix/FixParser';
import { validateFix } from '../../fix/FixValidator';
import { generateCopilotConfig } from '../../generator/CopilotConfigGenerator';
import { generateFixGapFillingPrompt } from '../../generator/fix/FixPromptsGenerator';
import { generateFixCopilotConfig } from '../../generator/FixCopilotConfigGenerator';
import { generateGapFillingPrompt } from '../../generator/story/PromptsGenerator';
import { backupCopilotInstructions } from '../../generator/utils/BackupManager';
import { assessDevTools, DevToolsAssessment } from '../../generator/utils/DevToolsAssessor';
import { IFileSystem } from '../../generator/utils/IFileSystem';
import { IWorkspace } from '../../generator/utils/IWorkspace';
import { appendLog } from '../../generator/utils/SessionLogger';
import { vscodeFileSystem } from '../../generator/utils/VscodeFileSystem';
import { vscodeWorkspace } from '../../generator/utils/VscodeWorkspace';
import { extractSpecType } from '../../parser/BaseParser';
import { Framework, Language } from '../../story/Story';
import { parseStory } from '../../story/StoryParser';
import { validateStory } from '../../story/StoryValidator';

/** Threshold in bytes above which a spec size warning is emitted. ~50 KB ≈ 12k tokens. */
const SPEC_SIZE_WARN_BYTES = 50_000;

export async function handleValidateCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
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
    stream.markdown(
      '❌ Nenhuma spec encontrada em `.speckit/`. Use `/new` ou `/fix` para criar uma.',
    );
    return;
  }

  const prompt = request.prompt ?? '';
  const includeDevTools = prompt.includes('--devtools');

  let content: string;
  try {
    content = await fs.readFile(specPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`❌ **Erro ao ler a spec** (\`${specPath}\`): ${msg}\n`);
    return;
  }

  warnIfSpecLarge(content, stream);

  if (token.isCancellationRequested) return;

  const specType = extractSpecType(content);

  if (specType === 'fix') {
    await validateFix_(
      workspaceRoot,
      specPath,
      content,
      stream,
      fs,
      workspace,
      includeDevTools,
      token,
    );
  } else {
    await validateStory_(workspaceRoot, content, stream, fs, workspace, includeDevTools, token);
  }
}

async function validateStory_(
  workspaceRoot: string,
  content: string,
  stream: vscode.ChatResponseStream,
  fs: IFileSystem,
  _workspace: IWorkspace,
  includeDevTools: boolean,
  token?: vscode.CancellationToken,
): Promise<void> {
  const story = parseStory(content);
  const result = validateStory(story);

  const dorLines = result.dorStatus
    .map((d) => `- [${d.checked ? 'x' : ' '}] ${d.criterion}`)
    .join('\n');

  if (!result.valid) {
    const gapPromptContent = generateGapFillingPrompt(story, result.gaps);
    const gapPromptPath = path.join(workspaceRoot, '.speckit', 'gap-fill.prompt.md');
    try {
      await fs.writeFile(gapPromptPath, gapPromptContent);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`❌ **Erro ao salvar gap-fill.prompt.md:** ${msg}\n`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument(gapPromptPath);
    await vscode.window.showTextDocument(doc);

    await appendLog(
      workspaceRoot,
      {
        command: '/validate',
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        outcome: `⚠️ Inválida — ${result.gaps.length} lacuna(s)`,
        detail: result.gaps.map((g) => `- [${g.section}] ${g.field}: ${g.message}`).join('\n'),
      },
      fs,
    );

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

  if (token?.isCancellationRequested) return;

  stream.markdown('⏳ Gerando arquivos de configuração do Copilot...\n');
  const backupPath = await backupCopilotInstructions(workspaceRoot, fs);
  if (backupPath) {
    stream.markdown('💾 Backup do `copilot-instructions.md` anterior salvo.\n');
  }

  let files: string[];
  try {
    files = await generateCopilotConfig(workspaceRoot, story, fs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`❌ **Erro ao gerar arquivos de configuração:** ${msg}\n`);
    return;
  }
  const fileList = files.map((f) => `- \`${f}\``).join('\n');

  await appendLog(
    workspaceRoot,
    {
      command: '/validate',
      specId: story.metadata.id,
      specTitle: story.metadata.title,
      outcome: `✅ Válida — ${files.length} arquivo(s) gerado(s)`,
      detail: files.map((f) => `- ${f}`).join('\n'),
    },
    fs,
  );

  stream.markdown(`✅ **${files.length} arquivo(s) gerado(s):**\n\n${fileList}\n\n---\n\n`);

  await offerDevTools(
    workspaceRoot,
    story.technicalSpec.language,
    story.technicalSpec.framework,
    stream,
    fs,
    includeDevTools,
  );

  stream.markdown(
    '**Sessão A — Implementação (portões 0–2):**\n' +
      '1. Abra um novo **Copilot Chat**\n' +
      '2. No dropdown de agentes, selecione **speckit-implementador**\n' +
      '3. O agente conduz: alinhamento → implementação → testes\n\n' +
      '**Sessão B — Revisão independente (portões 3–4):**\n' +
      '4. Ao concluir a Sessão A, abra um novo **Copilot Chat**\n' +
      '5. No dropdown de agentes, selecione **speckit-revisor**\n' +
      '6. O agente revisa e valida a entrega\n\n' +
      'Agentes em `.github/agents/`. Skills em `.github/skills/`.\n',
  );
}

async function validateFix_(
  workspaceRoot: string,
  specPath: string,
  content: string,
  stream: vscode.ChatResponseStream,
  fs: IFileSystem,
  workspace: IWorkspace,
  includeDevTools: boolean,
  token?: vscode.CancellationToken,
): Promise<void> {
  const fix = parseFix(content);
  const result = validateFix(fix);

  if (!result.valid) {
    const gapPromptContent = generateFixGapFillingPrompt(fix, result.gaps);
    const gapPromptPath = path.join(workspaceRoot, '.speckit', 'gap-fill.prompt.md');
    try {
      await fs.writeFile(gapPromptPath, gapPromptContent);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`❌ **Erro ao salvar gap-fill.prompt.md:** ${msg}\n`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument(gapPromptPath);
    await vscode.window.showTextDocument(doc);

    await appendLog(
      workspaceRoot,
      {
        command: '/validate',
        specId: fix.metadata.id,
        specTitle: fix.metadata.title,
        outcome: `⚠️ Fix inválido — ${result.gaps.length} lacuna(s)`,
        detail: result.gaps.map((g) => `- [${g.section}] ${g.field}: ${g.message}`).join('\n'),
      },
      fs,
    );

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

  if (token?.isCancellationRequested) return;

  stream.markdown('⏳ Detectando stack e gerando arquivos de configuração...\n');

  try {
    const backupPath = await backupCopilotInstructions(workspaceRoot, fs);
    if (backupPath) {
      stream.markdown('💾 Backup do `copilot-instructions.md` anterior salvo.\n');
    }
    const stack = await workspace.detectTechStack();
    const files = await generateFixCopilotConfig(workspaceRoot, fix, fs, workspace);
    const fileList = files.map((f) => `- \`${f}\``).join('\n');

    await appendLog(
      workspaceRoot,
      {
        command: '/validate',
        specId: fix.metadata.id,
        specTitle: fix.metadata.title,
        outcome: `✅ Fix válido — ${files.length} arquivo(s) gerado(s)`,
        detail: files.map((f) => `- ${f}`).join('\n'),
      },
      fs,
    );

    stream.markdown(`✅ **${files.length} arquivo(s) gerado(s):**\n\n${fileList}\n\n---\n\n`);

    await offerDevTools(
      workspaceRoot,
      stack.language,
      stack.framework,
      stream,
      fs,
      includeDevTools,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`❌ **Erro ao detectar stack:** ${msg}\n`);
    return;
  }

  stream.markdown(
    '▶ **Fluxo de correção:**\n\n' +
      '**Sessão A — Implementação (portões 0–2):**\n' +
      '1. Abra um novo **Copilot Chat**\n' +
      '2. No dropdown de agentes, selecione **speckit-fix-implementador**\n' +
      '3. Investigação → correção → testes de regressão\n\n' +
      '**Sessão B — Revisão independente (portões 3–4):**\n' +
      '4. Ao concluir a Sessão A, abra um novo **Copilot Chat**\n' +
      '5. No dropdown de agentes, selecione **speckit-fix-revisor**\n' +
      '6. Revisão e encerramento do fix\n\n' +
      'Agentes em `.github/agents/`. Skills em `.github/skills/`.\n',
  );
}

// ─── DevTools offer ──────────────────────────────────────────────────────────

async function offerDevTools(
  workspaceRoot: string,
  language: Language,
  framework: Framework,
  stream: vscode.ChatResponseStream,
  fs: IFileSystem,
  includeDevTools: boolean,
): Promise<void> {
  let assessment: DevToolsAssessment;
  try {
    assessment = await assessDevTools(workspaceRoot, fs);
  } catch {
    // Assessment failed — skip silently, never break the flow
    return;
  }

  if (assessment.allPresent) {
    stream.markdown(
      '✅ **Tooling de qualidade:** ESLint, Prettier, husky e lint-staged já configurados no projeto.\n\n',
    );
    return;
  }

  const missingList = assessment.missing
    .map((tool) => {
      switch (tool) {
        case 'ESLint':
          return '- 🔍 **ESLint** — análise estática de código (detecta bugs antes da execução)';
        case 'Prettier':
          return '- 🎨 **Prettier** — formatação automática (estilo consistente sem discussão)';
        case 'husky':
          return '- 🐶 **husky** — hooks de git (impede commit de código com problemas)';
        case 'lint-staged':
          return '- ⚡ **lint-staged** — lint apenas nos arquivos alterados (rápido no commit)';
        default:
          return `- 🔧 **${tool}**`;
      }
    })
    .join('\n');

  const presentList =
    assessment.present.length > 0
      ? `\n\n**Já configurados:** ${assessment.present.join(', ')}`
      : '';

  const conflictWarning =
    assessment.conflicts.length > 0
      ? `\n\n⚠️ **Conflitos detectados:**\n${assessment.conflicts.map((c) => `- ${c}`).join('\n')}`
      : '';

  const impactNote =
    assessment.present.length > 0
      ? '\n\n> ⚠️ **Impacto em projeto existente:** ESLint pode reportar warnings em código existente. ' +
        'Prettier reformata arquivos ao salvar (mudanças cosméticas no diff). ' +
        'Configurações existentes **não serão sobrescritas**. Nenhum comportamento do código muda.'
      : '\n\n> **Impacto:** ESLint pode reportar warnings em código existente. ' +
        'Prettier reformata arquivos ao salvar (mudanças cosméticas no diff). ' +
        'Nenhum comportamento do código muda.';

  // When --devtools flag is present, auto-generate the skill
  if (includeDevTools) {
    await writeDevToolsSkill(workspaceRoot, language, framework, assessment, fs);
    stream.markdown(
      `---\n\n✅ **Skill de DevTools incluído** — \`.github/skills/speckit-devtools/SKILL.md\`\n\n` +
        `Ferramentas a configurar: ${assessment.missing.join(', ')}${presentList}\n\n` +
        `O agente implementador usará este skill no Gate 0 para configurar o tooling.\n\n`,
    );
    return;
  }

  stream.markdown(
    `---\n\n` +
      `🔧 **Tooling de qualidade** — O SpecKit pode incluir um skill para instruir o agente implementador ` +
      `a configurar ferramentas de qualidade no seu projeto:\n\n` +
      `${missingList}${presentList}${conflictWarning}${impactNote}\n\n`,
  );

  if (typeof stream.button === 'function') {
    stream.button({
      title: '✅ Sim, incluir skill de DevTools',
      command: 'speckit.addDevToolsSkill',
      arguments: [workspaceRoot, language, framework, assessment],
    });
  }

  stream.markdown('\n\n> Para incluir manualmente depois: `@speckit /validate --devtools`\n\n');
}

async function writeDevToolsSkill(
  workspaceRoot: string,
  language: Language,
  framework: Framework,
  assessment: DevToolsAssessment,
  fs: IFileSystem,
): Promise<void> {
  const { generateDevToolsSkill } = await import('../../generator/skill/DevToolsSkillGenerator');
  const skillDir = workspaceRoot + '/.github/skills/speckit-devtools';
  await fs.ensureDir(skillDir);
  await fs.writeFile(
    skillDir + '/SKILL.md',
    generateDevToolsSkill({ language, framework, assessment }),
  );
}

// ─── Spec size warning ───────────────────────────────────────────────────────

export function warnIfSpecLarge(
  content: string,
  stream: { markdown: (text: string) => void },
): boolean {
  const sizeBytes = Buffer.byteLength(content, 'utf-8');
  if (sizeBytes <= SPEC_SIZE_WARN_BYTES) return false;

  const sizeKB = (sizeBytes / 1024).toFixed(0);
  stream.markdown(
    `⚠️ **Spec grande detectada** (~${sizeKB} KB). ` +
      `Specs muito extensas aumentam o consumo de tokens ao carregar o contexto no Copilot.\n\n` +
      `**Dicas para reduzir o tamanho da spec:**\n` +
      `- Simplifique descrições muito longas em "Requisito de Negócio" — mantenha o essencial\n` +
      `- Use critérios de aceite objetivos e curtos (formato Given/When/Then)\n` +
      `- Remova exemplos redundantes da seção "Fora de Escopo"\n` +
      `- Condense user stories em frases únicas ("Como X, quero Y, para Z")\n\n` +
      `> **Nota:** Isso é apenas um aviso — o processo continua normalmente.\n\n`,
  );
  return true;
}
