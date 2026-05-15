import { Router, Request, Response } from 'express';
import * as path from 'path';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';
import { parseStory } from '../../../../src/story/StoryParser';
import { validateStory } from '../../../../src/story/StoryValidator';
import { parseFix } from '../../../../src/fix/FixParser';
import { validateFix } from '../../../../src/fix/FixValidator';
import { generateGapFillingPrompt } from '../../../../src/generator/story/PromptsGenerator';
import { generateFixGapFillingPrompt } from '../../../../src/generator/fix/FixPromptsGenerator';
import { backupCopilotInstructions } from '../../../../src/generator/utils/BackupManager';
import { generateCopilotConfig } from '../../../../src/generator/CopilotConfigGenerator';
import { generateFixCopilotConfig } from '../../../../src/generator/FixCopilotConfigGenerator';
import { AuditLogger } from '../../../../src/workflow/AuditLogger';
import { emitCommandTelemetry } from '../../../../src/workflow/CommandTelemetry';
import { createCorrelationId } from '../../../../src/workflow/ObservabilityContext';
import { TraceabilityManager } from '../../../../src/workflow/TraceabilityManager';

const router = Router();

const GATE_LABELS: Record<number, string> = {
  0: 'Alinhamento',
  1: 'Implementação',
  2: 'Testes',
  3: 'Revisão',
  4: 'Entrega',
};

export function renderGateInfo(gate: number): string {
  const nextGate =
    gate < 0 || gate >= 4 ? 'nenhum' : `${gate + 1} — ${GATE_LABELS[gate + 1] ?? 'Próximo Gate'}`;
  return `🚪 **Gate atual:** ${gate} — ${GATE_LABELS[gate] ?? 'Desconhecido'} | **Próximo:** ${nextGate}`;
}

function renderGeneratedFiles(files: string[]): string {
  if (files.length === 0) return '- nenhum arquivo gerado';
  return files.map((file) => `- \`${file}\``).join('\n');
}

router.post('/validate', async (req: Request, res: Response) => {
  const { workspaceRoot, specPath } = req.body as {
    workspaceRoot: string;
    specPath?: string;
  };

  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  try {
    const commandExecutionId = createCorrelationId('exec');
    const audit = new AuditLogger(workspaceRoot, nodeFileSystem);
    const tracer = new TraceabilityManager(workspaceRoot, nodeFileSystem);
    const emitValidateTelemetry = async (input: {
      outcome: string;
      detail?: string;
      specId?: string;
      specTitle?: string;
      specType?: 'story' | 'fix';
      gate?: number;
    }): Promise<void> => {
      await emitCommandTelemetry({
        workspaceRoot,
        fs: nodeFileSystem,
        audit,
        tracer,
        command: '/validate',
        outcome: input.outcome,
        detail: input.detail,
        commandExecutionId,
        specId: input.specId ?? 'GLOBAL-VALIDATE',
        specTitle: input.specTitle ?? 'Validate Route',
        specType: input.specType ?? 'story',
        gate: input.gate,
        llmResponseReceived: true,
      });
    };

    const workspace = createNodeWorkspace(workspaceRoot);
    const activeSpecPath = specPath ?? (await workspace.getActiveSpecPath());

    if (!activeSpecPath) {
      await emitValidateTelemetry({
        outcome: '⛔ bloqueado: nenhuma spec ativa',
        detail: 'Nenhuma spec ativa encontrada no workspace.',
      });
      res.status(404).json({
        error: 'Nenhuma spec ativa encontrada',
        markdown: '❌ Nenhuma spec ativa encontrada. Use `/new` para criar uma.',
      });
      return;
    }

    const content = await nodeFileSystem.readFile(activeSpecPath);
    const isFix = activeSpecPath.includes('FIX-');

    if (isFix) {
      const fix = parseFix(content);
      const result = validateFix(fix);
      const relativeSpecPath = activeSpecPath
        .replace(workspaceRoot + path.sep, '')
        .replace(workspaceRoot.replace(/\\/g, '/') + '/', '')
        .replace(/\\/g, '/');

      if (!result.valid) {
        const gapPromptPath = path.join(workspaceRoot, '.speckit', 'gap-fill.prompt.md');
        const gapPromptContent = generateFixGapFillingPrompt(fix, result.gaps);
        await nodeFileSystem.writeFile(gapPromptPath, gapPromptContent);
        const relativeGapPrompt = gapPromptPath
          .replace(workspaceRoot + path.sep, '')
          .replace(workspaceRoot.replace(/\\/g, '/') + '/', '')
          .replace(/\\/g, '/');

        await emitValidateTelemetry({
          outcome: `⚠️ fix inválido (${result.gaps.length} lacuna[s])`,
          detail: `Gap-fill gerado em ${relativeGapPrompt}`,
          specId: fix.metadata.id,
          specTitle: fix.metadata.title,
          specType: 'fix',
          gate: fix.metadata.gate,
        });
        res.json({
          valid: false,
          gaps: result.gaps,
          specPath: activeSpecPath,
          markdown:
            `⚠️ **Fix incompleto — ${result.gaps.length} lacuna(s) encontrada(s)**\n\n` +
            `✅ Arquivo de preenchimento criado: \`${relativeGapPrompt}\`\n\n` +
            'Preencha as lacunas no prompt e execute `/validate` novamente.\n\n' +
            '### Comandos contextuais\n' +
            '- `/validate`\n' +
            '- `/status`',
        });
        return;
      }

      const backupPath = await backupCopilotInstructions(workspaceRoot, nodeFileSystem);
      const files = await generateFixCopilotConfig(workspaceRoot, fix, nodeFileSystem, workspace);
      await emitValidateTelemetry({
        outcome: `✅ fix válido (${files.length} arquivo[s] gerado[s])`,
        detail: files.join('\n'),
        specId: fix.metadata.id,
        specTitle: fix.metadata.title,
        specType: 'fix',
        gate: fix.metadata.gate,
      });
      res.json({
        valid: true,
        gaps: [],
        specPath: activeSpecPath,
        generatedFiles: files,
        backupPath,
        markdown:
          `✅ **Fix válido** — \`${relativeSpecPath}\`\n\n` +
          (backupPath ? '💾 Backup do `copilot-instructions.md` anterior salvo.\n\n' : '') +
          `✅ **${files.length} arquivo(s) gerado(s):**\n${renderGeneratedFiles(files)}\n\n` +
          `${renderGateInfo(fix.metadata.gate)}\n\n` +
          '### Comandos contextuais\n' +
          '- `/status`\n' +
          '- `/validate`',
      });
    } else {
      const story = parseStory(content);
      const result = validateStory(story);
      const relativeSpecPath = activeSpecPath
        .replace(workspaceRoot + path.sep, '')
        .replace(workspaceRoot.replace(/\\/g, '/') + '/', '')
        .replace(/\\/g, '/');

      const dorLines = result.dorStatus
        .map((criterion) => `- [${criterion.checked ? 'x' : ' '}] ${criterion.criterion}`)
        .join('\n');

      if (!result.valid) {
        const gapPromptPath = path.join(workspaceRoot, '.speckit', 'gap-fill.prompt.md');
        const gapPromptContent = generateGapFillingPrompt(story, result.gaps);
        await nodeFileSystem.writeFile(gapPromptPath, gapPromptContent);
        const relativeGapPrompt = gapPromptPath
          .replace(workspaceRoot + path.sep, '')
          .replace(workspaceRoot.replace(/\\/g, '/') + '/', '')
          .replace(/\\/g, '/');

        await emitValidateTelemetry({
          outcome: `⚠️ story inválida (${result.gaps.length} lacuna[s])`,
          detail: `Gap-fill gerado em ${relativeGapPrompt}`,
          specId: story.metadata.id,
          specTitle: story.metadata.title,
          specType: 'story',
          gate: story.metadata.gate,
        });
        res.json({
          valid: false,
          gaps: result.gaps,
          specPath: activeSpecPath,
          markdown:
            `⚠️ **História incompleta — ${result.gaps.length} lacuna(s) encontrada(s)**\n\n` +
            `**Status do DoR:**\n${dorLines}\n\n` +
            `✅ Arquivo de preenchimento criado: \`${relativeGapPrompt}\`\n\n` +
            'Preencha as lacunas no prompt e execute `/validate` novamente.\n\n' +
            '### Comandos contextuais\n' +
            '- `/validate`\n' +
            '- `/status`',
        });
        return;
      }

      const backupPath = await backupCopilotInstructions(workspaceRoot, nodeFileSystem);
      const files = await generateCopilotConfig(workspaceRoot, story, nodeFileSystem);
      await emitValidateTelemetry({
        outcome: `✅ story válida (${files.length} arquivo[s] gerado[s])`,
        detail: files.join('\n'),
        specId: story.metadata.id,
        specTitle: story.metadata.title,
        specType: 'story',
        gate: story.metadata.gate,
      });
      res.json({
        valid: true,
        gaps: [],
        specPath: activeSpecPath,
        generatedFiles: files,
        backupPath,
        markdown:
          `✅ **DoR atingido** — história válida (\`${relativeSpecPath}\`).\n\n` +
          `**Status do DoR:**\n${dorLines}\n\n` +
          (backupPath ? '💾 Backup do `copilot-instructions.md` anterior salvo.\n\n' : '') +
          `✅ **${files.length} arquivo(s) gerado(s):**\n${renderGeneratedFiles(files)}\n\n` +
          `${renderGateInfo(story.metadata.gate)}\n\n` +
          '### Comandos contextuais\n' +
          '- `/status`\n' +
          '- `/review-auto`\n' +
          '- `/review-auto --confirm <intent-id>`',
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
