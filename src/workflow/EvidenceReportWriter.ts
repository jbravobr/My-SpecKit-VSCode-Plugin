import * as path from 'path';
import type { IFileSystem } from '../generator/utils/IFileSystem';
import type { EvidenceReport } from './GateEvidenceCollector';
import { buildRevisorPrompt } from './RevisorFeedbackBridge';
import type { Finding } from '../validator/auto/types';
import { redactSensitiveText, redactSensitiveUnknown } from '../security/Redaction';

export interface WrittenEvidence {
  reportPath: string;
  latestPath: string;
  jsonPath: string;
}

export class EvidenceReportWriter {
  constructor(
    private readonly fs: IFileSystem,
    private readonly workspaceRoot: string,
    private readonly subdir: string = '.speckit/evidence',
  ) {}

  private dir(): string {
    return path.posix.join(this.workspaceRoot.replace(/\\/g, '/'), this.subdir);
  }

  async write(report: EvidenceReport, specId?: string): Promise<WrittenEvidence> {
    const dir = this.dir();
    await this.fs.ensureDir(dir);
    const safeRunId = sanitizeFileSegment(report.runId);
    const safeSpecId = specId ? sanitizeFileSegment(specId) : undefined;
    const sanitizedFindings = sanitizeFindings(report.findings);
    const safeReport: EvidenceReport = {
      ...report,
      findings: sanitizedFindings,
    };
    const prompt = buildRevisorPrompt(safeReport);
    const suffix = safeSpecId ? `${safeSpecId}-` : '';
    const reportPath = path.posix.join(dir, `${suffix}${safeRunId}.md`);
    const latestPath = path.posix.join(dir, `latest.md`);
    const jsonPath = path.posix.join(dir, `${suffix}${safeRunId}.json`);

    const md =
      `# Evidência — Gate ${safeReport.gate}\n\n` + `> ${prompt.summary}\n\n` + `${prompt.body}\n`;
    const json = JSON.stringify(
      {
        gate: safeReport.gate,
        passed: safeReport.passed,
        runId: safeReport.runId,
        durationMs: safeReport.durationMs,
        validatorsRun: safeReport.validatorsRun,
        findings: safeReport.findings,
        delegatedCommands: prompt.delegatedCommands,
        specId,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    );

    await this.fs.writeFile(reportPath, md);
    await this.fs.writeFile(latestPath, md);
    await this.fs.writeFile(jsonPath, json);
    return { reportPath, latestPath, jsonPath };
  }
}

function sanitizeFindings(findings: Finding[]): Finding[] {
  return findings.map((finding) => ({
    ...finding,
    message: redactSensitiveText(finding.message),
    path: finding.path ? redactSensitiveText(finding.path) : undefined,
    suggestedFix: finding.suggestedFix ? redactSensitiveText(finding.suggestedFix) : undefined,
    delegatedToRevisor: finding.delegatedToRevisor
      ? {
          reason: redactSensitiveText(finding.delegatedToRevisor.reason),
          command: redactSensitiveText(finding.delegatedToRevisor.command),
          stack: finding.delegatedToRevisor.stack
            ? redactSensitiveText(finding.delegatedToRevisor.stack)
            : undefined,
        }
      : undefined,
    metadata: finding.metadata
      ? (redactSensitiveUnknown(finding.metadata) as Record<string, unknown>)
      : undefined,
  }));
}

function sanitizeFileSegment(value: string): string {
  const normalized = value
    .replace(/[\\/]+/g, '-')
    .replace(/\.\.+/g, '.')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .trim();
  return normalized.length > 0 ? normalized : 'evidence';
}
