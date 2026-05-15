import { Router, Request, Response } from 'express';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';
import type { Gate } from '../../../../src/story/Story';
import { parseStory } from '../../../../src/story/StoryParser';
import {
  AcceptanceCriteriaTestPresenceValidator,
  CoverageThresholdValidator,
  CrapValidator,
  SecretLeakValidator,
  StoryHeuristicValidator,
  TestExecutionValidator,
  TypecheckValidator,
} from '../../../../src/validator/auto';
import { EvidenceReportWriter } from '../../../../src/workflow/EvidenceReportWriter';
import { GateEvidenceCollector } from '../../../../src/workflow/GateEvidenceCollector';
import { gitOps } from '../../../../src/workflow/GitOperations';
import { MetricsRecorder } from '../../../../src/workflow/MetricsRecorder';
import { buildRevisorPrompt } from '../../../../src/workflow/RevisorFeedbackBridge';

const router = Router();

function parseGateArg(raw: unknown): Gate | undefined {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 4) return raw as Gate;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 4) return n as Gate;
  }
  return undefined;
}

export function resolveVerifyTargetGate(currentGate: Gate, explicitGate?: Gate): Gate {
  if (explicitGate !== undefined) return explicitGate;
  return currentGate >= 4 ? 4 : ((currentGate + 1) as Gate);
}

function toRelativePath(workspaceRoot: string, absolutePath: string): string {
  return absolutePath
    .replace(workspaceRoot.replace(/\\/g, '/'), '.')
    .replace(/^\.\//, '');
}

export function buildDefaultCollector(): GateEvidenceCollector {
  const c = new GateEvidenceCollector();
  c.registerValidator(new StoryHeuristicValidator());
  c.registerValidator(new TypecheckValidator());
  c.registerValidator(new AcceptanceCriteriaTestPresenceValidator());
  c.registerValidator(new TestExecutionValidator());
  c.registerValidator(new CoverageThresholdValidator());
  c.registerValidator(new CrapValidator());
  c.registerValidator(new SecretLeakValidator());
  return c;
}

router.post('/verify', async (req: Request, res: Response) => {
  const { workspaceRoot, specPath, gate } = req.body as {
    workspaceRoot: string;
    specPath?: string;
    gate?: number | string;
  };

  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }

  try {
    const workspace = createNodeWorkspace(workspaceRoot);
    const activeSpecPath = specPath ?? (await workspace.getActiveSpecPath());
    if (!activeSpecPath) {
      res.status(404).json({
        error: 'Nenhuma spec ativa em `.speckit/`.',
        markdown: '❌ Nenhuma spec ativa em `.speckit/`. Use `/new` para criar uma antes de `/verify`.',
      });
      return;
    }

    const content = await nodeFileSystem.readFile(activeSpecPath);
    const story = parseStory(content);
    const explicitGate = parseGateArg(gate);
    const target = resolveVerifyTargetGate(story.metadata.gate, explicitGate);

    let storyFiles: string[] = [];
    try {
      if (gitOps.changedFiles) {
        storyFiles = await gitOps.changedFiles(workspaceRoot);
      }
    } catch {
      storyFiles = [];
    }

    const collector = buildDefaultCollector();
    const report = await collector.collect({
      workspaceRoot,
      fs: nodeFileSystem,
      story,
      storyFiles,
      gateTarget: target,
    });

    const writer = new EvidenceReportWriter(nodeFileSystem, workspaceRoot);
    const written = await writer.write(report, story.metadata.id);

    try {
      const recorder = new MetricsRecorder(nodeFileSystem, workspaceRoot);
      await recorder.recordEvidence(story.metadata.id, report);
      await recorder.record({
        type: 'verify-command',
        ts: new Date().toISOString(),
        specId: story.metadata.id,
        gate: target,
        durationMs: report.durationMs,
        passed: report.passed,
      });
    } catch {
      // metrics must never break verify
    }

    const prompt = buildRevisorPrompt(report);
    const markdown =
      `${report.passed ? '✅' : '🛑'} **${prompt.summary}**\n\n` +
      `${prompt.body}\n\n` +
      `---\n` +
      `Evidência persistida em:\n` +
      `- 📄 \`${toRelativePath(workspaceRoot, written.reportPath)}\`\n` +
      `- 🧾 \`${toRelativePath(workspaceRoot, written.jsonPath)}\`\n` +
      `- 🔖 \`${toRelativePath(workspaceRoot, written.latestPath)}\` (atualizado)\n\n` +
      `O **Revisor** deve consumir \`.speckit/evidence/latest.md\` no próximo turno e coordenar correções com o Implementador até findings = 0.\n`;

    res.json({
      specPath: activeSpecPath,
      targetGate: target,
      report,
      written,
      markdown,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message, markdown: `❌ Erro ao executar /verify: ${message}` });
  }
});

export default router;
