import { Router, Request, Response } from 'express';
import * as path from 'path';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';
import { parseStory } from '../../../../src/story/StoryParser';
import { validateStory } from '../../../../src/story/StoryValidator';
import { parseFix } from '../../../../src/fix/FixParser';
import { validateFix } from '../../../../src/fix/FixValidator';
import { backupCopilotInstructions } from '../../../../src/generator/utils/BackupManager';
import { generateCopilotConfig } from '../../../../src/generator/CopilotConfigGenerator';
import { generateFixCopilotConfig } from '../../../../src/generator/FixCopilotConfigGenerator';
import { generateUnifiedAgent } from '../../../../src/generator/agent/StoryUnifiedAgentGenerator';
import { generateBatchIndex } from '../../../../src/generator/story/BatchIndexGenerator';
import {
  BatchBranchRuntimeContext,
  detectBatchBranchMentions,
  generateBatchBranchGovernanceSummary,
  generateBatchBranchModeMessage,
} from '../../../../src/generator/utils/BranchGovernance';
import { analyzeDependencies } from '../../../../src/generator/utils/DependencyGraph';
import {
  createTransitionIntent,
  consumeTransitionIntent,
  getBranchSessionGovernance,
  setBranchSessionGovernance,
} from '../../../../src/workflow/TransitionGovernance';
import { gitOps } from '../../../../src/workflow/GitOperations';
import type { Story } from '../../../../src/story/Story';
import {
  formatExplicitConfirmationNotice,
  formatInvalidConfirmationNotice,
} from './confirmationMarkdown';

const router = Router();

interface BatchResultEntry {
  fileName: string;
  specType: 'story' | 'fix';
  valid: boolean;
  gaps: string[];
  title: string;
  id: string;
  gate: number;
  status: string;
  error?: string;
}

export interface BatchControlInput {
  generate?: boolean;
  unified?: boolean;
  storyId?: string;
  branchStrategy?: string;
  confirmIntentId?: string;
}

export function validateBatchControl(
  input: BatchControlInput,
): { ok: true } | { ok: false; markdown: string } {
  const generate = !!input.generate;
  const unified = !!input.unified;
  const storyId = input.storyId?.trim();
  const branchStrategy = input.branchStrategy?.trim();
  const confirmIntentId = input.confirmIntentId?.trim();

  if (storyId && !(generate && unified)) {
    return {
      ok: false,
      markdown:
        '❌ A flag `--story` só pode ser usada com `--generate --unified`.\n\n' +
        '**Exemplo:** `/batch --generate --unified --story <id>`',
    };
  }

  if ((branchStrategy || confirmIntentId) && !(generate && unified)) {
    return {
      ok: false,
      markdown:
        '❌ `--branch-strategy` e `--confirm` só podem ser usados com `--generate --unified`.',
    };
  }

  if (branchStrategy) {
    const normalizedStrategy = branchStrategy.toLowerCase();
    if (normalizedStrategy !== 'session' && normalizedStrategy !== 'cited') {
      return {
        ok: false,
        markdown:
          `❌ Estratégia de branch inválida: \`${branchStrategy}\`. ` +
          'Use apenas `session` ou `cited`.',
      };
    }
  }

  return { ok: true };
}

function buildSuggestedBatchBranchName(workspaceRoot: string): string {
  const now = new Date();
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const workspaceSlug =
    path
      .basename(workspaceRoot)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'workspace';
  return `feature/batch-${yyyymmdd}-${workspaceSlug}`;
}

function isMissingCurrentBranchError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const normalized = message.toLowerCase();
  return (
    normalized.includes('head indefinido') ||
    normalized.includes('detached') ||
    normalized.includes('branch atual')
  );
}

async function resolveBatchBranchContext(
  workspaceRoot: string,
  stories: Story[],
  branchStrategy?: string,
  confirmIntentId?: string,
): Promise<
  | { ok: true; context?: BatchBranchRuntimeContext; markdownNote?: string }
  | { ok: false; markdown: string }
> {
  const citedMentions = detectBatchBranchMentions(stories);
  if (citedMentions.length === 0) {
    return { ok: true, context: undefined };
  }

  const persistedGovernance =
    branchStrategy || confirmIntentId
      ? undefined
      : await getBranchSessionGovernance(workspaceRoot, nodeFileSystem);

  if (persistedGovernance) {
    return {
      ok: true,
      context: {
        strategy: persistedGovernance.strategy,
        citedMentions,
        sessionBranch: persistedGovernance.sessionBranch,
        sessionBranchSource: persistedGovernance.sessionBranchSource,
      },
      markdownNote: `♻️ Reutilizando governança de branch da sessão: ${generateBatchBranchModeMessage(
        {
          strategy: persistedGovernance.strategy,
          citedMentions,
          sessionBranch: persistedGovernance.sessionBranch,
          sessionBranchSource: persistedGovernance.sessionBranchSource,
        },
      )}`,
    };
  }

  if (!branchStrategy) {
    return {
      ok: false,
      markdown:
        `### 🌿 Governança de branch citada (obrigatória)\n\n` +
        `As stories deste lote citam ${citedMentions.map((mention) => `\`${mention}\``).join(', ')}.\n\n` +
        'Escolha explicitamente uma estratégia antes da geração:\n' +
        '- `/batch --generate --unified --branch-strategy session`\n' +
        '- `/batch --generate --unified --branch-strategy cited`\n',
    };
  }

  if (branchStrategy === 'cited') {
    const governance = await setBranchSessionGovernance(workspaceRoot, nodeFileSystem, {
      strategy: 'cited',
      command: '/batch --generate --unified',
      citedMentions,
    });
    return {
      ok: true,
      context: {
        strategy: governance.strategy,
        citedMentions,
      },
      markdownNote: `✅ ${generateBatchBranchModeMessage({
        strategy: governance.strategy,
        citedMentions,
      })}`,
    };
  }

  if (!(await gitOps.isRepository(workspaceRoot))) {
    return {
      ok: false,
      markdown:
        '❌ Não foi possível aplicar a estratégia `session`: o workspace atual não está em um repositório Git.',
    };
  }

  if (confirmIntentId) {
    const intent = await consumeTransitionIntent(
      workspaceRoot,
      nodeFileSystem,
      confirmIntentId,
      'branch-governance',
    );
    if (!intent || intent.payload.action !== 'create-session-branch') {
      return {
        ok: false,
        markdown: formatInvalidConfirmationNotice(
          confirmIntentId,
          '/batch --generate --unified --branch-strategy session',
          'criação de branch da sessão',
        ),
      };
    }

    const branchName = intent.payload.branchName;
    if (!branchName) {
      return {
        ok: false,
        markdown:
          '❌ O intent de branch não contém o nome da branch sugerida. Gere nova proposta para continuar.',
      };
    }

    if (!gitOps.createBranch) {
      return {
        ok: false,
        markdown: '❌ O runtime Git configurado não suporta criação de branch neste fluxo.',
      };
    }

    try {
      await gitOps.createBranch(workspaceRoot, branchName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        markdown: `❌ Não foi possível criar a branch sugerida \`${branchName}\`: ${message}`,
      };
    }

    const governance = await setBranchSessionGovernance(workspaceRoot, nodeFileSystem, {
      strategy: 'session',
      command: '/batch --generate --unified',
      citedMentions,
      sessionBranch: branchName,
      sessionBranchSource: 'created',
    });
    return {
      ok: true,
      context: {
        strategy: governance.strategy,
        citedMentions,
        sessionBranch: governance.sessionBranch,
        sessionBranchSource: governance.sessionBranchSource,
      },
      markdownNote: `✅ Branch da sessão criada e fixada para este lote: \`${branchName}\`.`,
    };
  }

  if (!gitOps.currentBranch) {
    return {
      ok: false,
      markdown: '❌ O runtime Git configurado não suporta leitura da branch atual neste fluxo.',
    };
  }

  try {
    const currentBranch = await gitOps.currentBranch(workspaceRoot);
    const governance = await setBranchSessionGovernance(workspaceRoot, nodeFileSystem, {
      strategy: 'session',
      command: '/batch --generate --unified',
      citedMentions,
      sessionBranch: currentBranch,
      sessionBranchSource: 'current',
    });
    return {
      ok: true,
      context: {
        strategy: governance.strategy,
        citedMentions,
        sessionBranch: governance.sessionBranch,
        sessionBranchSource: governance.sessionBranchSource,
      },
      markdownNote: `✅ ${generateBatchBranchModeMessage({
        strategy: governance.strategy,
        citedMentions,
        sessionBranch: governance.sessionBranch,
        sessionBranchSource: governance.sessionBranchSource,
      })}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isMissingCurrentBranchError(err)) {
      return {
        ok: false,
        markdown: `❌ Não foi possível resolver a branch atual da sessão: ${message}`,
      };
    }

    const suggestedBranch = buildSuggestedBatchBranchName(workspaceRoot);
    const intent = await createTransitionIntent(workspaceRoot, nodeFileSystem, {
      kind: 'branch-governance',
      command: '/batch --generate --unified',
      payload: {
        action: 'create-session-branch',
        branchName: suggestedBranch,
        strategy: 'session',
      },
      ttlMinutes: 240,
    });

    return {
      ok: false,
      markdown:
        `### 🌿 Criação de branch da sessão (confirmação obrigatória)\n\n` +
        `A estratégia \`session\` foi escolhida, mas nenhuma branch ativa pôde ser resolvida no Git (${message}).\n\n` +
        `Sugestão de branch para este lote: \`${suggestedBranch}\`\n\n` +
        formatExplicitConfirmationNotice({
          intentId: intent.id,
          confirmCommand: `/batch --generate --unified --branch-strategy session --confirm ${intent.id}`,
          confirmEffect: `a branch \`${suggestedBranch}\` será criada e fixada como branch da sessão para este lote.`,
          noConfirmationEffect:
            'nenhuma branch será criada e a geração unificada continuará bloqueada.',
          ttlMinutes: 240,
        }) +
        '\n',
    };
  }
}

router.post('/batch', async (req: Request, res: Response) => {
  const { workspaceRoot, generate, unified } = req.body as {
    workspaceRoot: string;
    generate?: boolean;
    unified?: boolean;
    storyId?: string;
    branchStrategy?: string;
    confirmIntentId?: string;
  };
  const storyId = typeof req.body?.storyId === 'string' ? req.body.storyId.trim() : undefined;
  const branchStrategy =
    typeof req.body?.branchStrategy === 'string' ? req.body.branchStrategy.trim() : undefined;
  const confirmIntentId =
    typeof req.body?.confirmIntentId === 'string' ? req.body.confirmIntentId.trim() : undefined;

  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  const controlValidation = validateBatchControl({
    generate,
    unified,
    storyId,
    branchStrategy,
    confirmIntentId,
  });
  if (!controlValidation.ok) {
    res.status(400).json({
      error: 'invalid batch control flags',
      markdown: controlValidation.markdown,
    });
    return;
  }

  try {
    const workspace = createNodeWorkspace(workspaceRoot);
    const specDir = path.join(workspaceRoot, '.speckit');
    const githubDir = path.join(workspaceRoot, '.github');

    const [storyFiles, fixFiles] = await Promise.all([
      workspace.listStoryFiles(specDir),
      workspace.listFixFiles(specDir),
    ]);

    const results: BatchResultEntry[] = [];

    for (const name of storyFiles.sort()) {
      try {
        const content = await nodeFileSystem.readFile(path.join(specDir, name));
        const story = parseStory(content);
        if (story.metadata.status === 'done' || story.metadata.status === 'cancelled') continue;
        const result = validateStory(story);
        results.push({
          fileName: name,
          specType: 'story',
          valid: result.valid,
          gaps: result.gaps.map((g) => g.message),
          title: story.metadata.title || '',
          id: story.metadata.id || name,
          gate: story.metadata.gate ?? 0,
          status: story.metadata.status || 'open',
        });
      } catch (e) {
        results.push({
          fileName: name,
          specType: 'story',
          valid: false,
          gaps: ['Erro ao processar arquivo'],
          title: '',
          id: name,
          gate: 0,
          status: 'open',
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    for (const name of fixFiles.sort()) {
      try {
        const content = await nodeFileSystem.readFile(path.join(specDir, name));
        const fix = parseFix(content);
        if (fix.metadata.status === 'done' || fix.metadata.status === 'cancelled') continue;
        const result = validateFix(fix);
        results.push({
          fileName: name,
          specType: 'fix',
          valid: result.valid,
          gaps: result.gaps.map((g) => g.message),
          title: fix.metadata.title || '',
          id: fix.metadata.id || name,
          gate: fix.metadata.gate ?? 0,
          status: fix.metadata.status || 'open',
        });
      } catch (e) {
        results.push({
          fileName: name,
          specType: 'fix',
          valid: false,
          gaps: ['Erro ao processar arquivo'],
          title: '',
          id: name,
          gate: 0,
          status: 'open',
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    const filteredResults = storyId
      ? results.filter(
          (entry) => entry.specType === 'story' && entry.id.toLowerCase() === storyId.toLowerCase(),
        )
      : results;

    if (storyId && filteredResults.length === 0) {
      const availableStories = results
        .filter((entry) => entry.specType === 'story')
        .map((entry) => `\`${entry.id}\``);
      res.status(404).json({
        error: `Story ${storyId} não encontrada`,
        markdown:
          `❌ Story \`${storyId}\` não encontrada no lote atual.\n` +
          (availableStories.length > 0
            ? `\nStories disponíveis: ${availableStories.join(', ')}\n`
            : '\nNenhuma story encontrada em `.speckit/`.\n'),
      });
      return;
    }

    const validCount = filteredResults.filter((r) => r.valid).length;
    const invalidCount = filteredResults.filter((r) => !r.valid).length;
    const validEntries = filteredResults.filter((r) => r.valid);

    let markdown =
      `## 📦 Batch — ${filteredResults.length} spec(s) processada(s)\n\n` +
      `✅ Válidas: ${validCount} | ❌ Inválidas: ${invalidCount}\n\n` +
      '| Arquivo | Tipo | Status | Gate | Válida | Lacunas |\n|---|---|---|---|---|---|\n' +
      filteredResults
        .map(
          (r) =>
            `| \`${r.fileName}\` | ${r.specType} | ${r.status} | ${r.gate} | ${r.valid ? '✅' : '❌'} | ${r.gaps.length} |`,
        )
        .join('\n');

    const generated: Array<{
      id: string;
      files: string[];
      mode: 'legacy' | 'unified' | 'fix-unified';
    }> = [];
    const failed: Array<{ id: string; error: string }> = [];
    let backupPath: string | undefined;

    if (generate) {
      if (unified) {
        const validStories: Story[] = [];
        for (const entry of validEntries.filter((e) => e.specType === 'story')) {
          try {
            const content = await nodeFileSystem.readFile(path.join(specDir, entry.fileName));
            validStories.push(parseStory(content));
          } catch (err: unknown) {
            failed.push({
              id: entry.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const branchContextResult = await resolveBatchBranchContext(
          workspaceRoot,
          validStories,
          branchStrategy?.toLowerCase(),
          confirmIntentId,
        );
        if (!branchContextResult.ok) {
          res.status(409).json({
            error: 'branch governance decision required',
            markdown: branchContextResult.markdown,
            results: filteredResults,
            validCount,
            invalidCount,
            generate: !!generate,
            unified: !!unified,
            backupPath,
            generated,
            failed,
          });
          return;
        }
        const branchContext = branchContextResult.context;
        if (branchContextResult.markdownNote) {
          markdown += `\n\n${branchContextResult.markdownNote}\n`;
        }

        backupPath = await backupCopilotInstructions(workspaceRoot, nodeFileSystem);

        // Generate one unified agent per valid story
        const agentsDir = path.join(githubDir, 'agents');
        await nodeFileSystem.ensureDir(agentsDir);
        for (const story of validStories) {
          try {
            const agentPath = path.join(agentsDir, `speckit-story-${story.metadata.id}.agent.md`);
            await nodeFileSystem.writeFile(agentPath, generateUnifiedAgent(story, branchContext));
            generated.push({
              id: story.metadata.id,
              files: [
                agentPath
                  .replace(workspaceRoot + path.sep, '')
                  .replace(workspaceRoot.replace(/\\/g, '/') + '/', '')
                  .replace(/\\/g, '/'),
              ],
              mode: 'unified',
            });
          } catch (err: unknown) {
            failed.push({
              id: story.metadata.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // Generate batch index
        if (validStories.length > 0) {
          const indexPath = path.join(githubDir, 'copilot-instructions.md');
          await nodeFileSystem.ensureDir(githubDir);
          await nodeFileSystem.writeFile(
            indexPath,
            generateBatchIndex(validStories, branchContext),
          );
          generated.push({
            id: 'GLOBAL-BATCH',
            files: ['.github/copilot-instructions.md'],
            mode: 'unified',
          });
        }

        // Keep fix generation parity in unified mode
        const validFixes = validEntries.filter((e) => e.specType === 'fix');
        for (const entry of validFixes) {
          try {
            const content = await nodeFileSystem.readFile(path.join(specDir, entry.fileName));
            const fix = parseFix(content);
            const files = await generateFixCopilotConfig(
              workspaceRoot,
              fix,
              nodeFileSystem,
              workspace,
            );
            generated.push({ id: entry.id, files, mode: 'fix-unified' });
          } catch (err: unknown) {
            failed.push({
              id: entry.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const depResult = analyzeDependencies(validStories);
        const branchModeMessage = generateBatchBranchModeMessage(branchContext);
        const branchGovernanceSummary = generateBatchBranchGovernanceSummary(
          validStories,
          branchContext,
        );
        markdown +=
          `\n\n---\n\n` +
          `✅ Modo unificado executado: ${validStories.length} story(s), ${validEntries.filter((e) => e.specType === 'fix').length} fix(es).\n` +
          `- 🔗 Independentes: ${depResult.independent.length}\n` +
          `- ⛔ Bloqueadas por dependência: ${depResult.blocked.size}\n` +
          `- 🤖 Agentes unificados gerados em \`.github/agents/\`\n` +
          `- 📄 \`.github/copilot-instructions.md\` atualizado em modo batch\n` +
          (branchModeMessage ? `\n${branchModeMessage}\n` : '') +
          (branchGovernanceSummary ? `\n${branchGovernanceSummary}\n` : '');
      } else {
        // Legacy generate mode (same behavior as participant's non-unified generation)
        backupPath = await backupCopilotInstructions(workspaceRoot, nodeFileSystem);
        for (const entry of validEntries) {
          try {
            const content = await nodeFileSystem.readFile(path.join(specDir, entry.fileName));
            const files =
              entry.specType === 'story'
                ? await generateCopilotConfig(workspaceRoot, parseStory(content), nodeFileSystem)
                : await generateFixCopilotConfig(
                    workspaceRoot,
                    parseFix(content),
                    nodeFileSystem,
                    workspace,
                  );
            generated.push({ id: entry.id, files, mode: 'legacy' });
          } catch (err: unknown) {
            failed.push({
              id: entry.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        markdown +=
          `\n\n---\n\n` +
          `✅ Geração legada executada para ${generated.filter((g) => g.mode === 'legacy').length} spec(s).\n` +
          `> ⚠️ A última spec processada pode sobrescrever o \`.github/copilot-instructions.md\` ativo, conforme fluxo legado do participant.\n`;
      }
    }

    res.json({
      results: filteredResults,
      validCount,
      invalidCount,
      generate: !!generate,
      unified: !!unified,
      backupPath,
      generated,
      failed,
      markdown,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
