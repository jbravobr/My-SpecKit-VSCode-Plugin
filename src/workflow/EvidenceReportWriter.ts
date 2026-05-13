import * as path from 'path';
import type { IFileSystem } from '../generator/utils/IFileSystem';
import type { EvidenceReport } from './GateEvidenceCollector';
import { buildRevisorPrompt } from './RevisorFeedbackBridge';

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
    const prompt = buildRevisorPrompt(report);
    const suffix = specId ? `${specId}-` : '';
    const reportPath = path.posix.join(dir, `${suffix}${report.runId}.md`);
    const latestPath = path.posix.join(dir, `latest.md`);
    const jsonPath = path.posix.join(dir, `${suffix}${report.runId}.json`);

    const md =
      `# Evidência — Gate ${report.gate}\n\n` + `> ${prompt.summary}\n\n` + `${prompt.body}\n`;
    const json = JSON.stringify(
      {
        gate: report.gate,
        passed: report.passed,
        runId: report.runId,
        durationMs: report.durationMs,
        validatorsRun: report.validatorsRun,
        findings: report.findings,
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
