import * as path from 'path';
import * as vscode from 'vscode';
import type { IFileSystem } from '../generator/utils/IFileSystem';

interface RawFinding {
  validator?: string;
  severity?: string;
  message?: string;
  path?: string;
  line?: number;
  suggestedFix?: string;
}

interface RawEvidence {
  gate?: number;
  passed?: boolean;
  runId?: string;
  durationMs?: number;
  findings?: RawFinding[];
}

function toVscodeSeverity(sev: string | undefined): vscode.DiagnosticSeverity {
  switch (sev) {
    case 'blocker':
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warn':
      return vscode.DiagnosticSeverity.Warning;
    case 'info':
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Hint;
  }
}

export class SpeckitDiagnostics {
  private readonly collection: vscode.DiagnosticCollection;

  constructor(
    private readonly fs: IFileSystem,
    private readonly workspaceRoot: string,
  ) {
    this.collection = vscode.languages.createDiagnosticCollection('speckit');
  }

  dispose(): void {
    this.collection.dispose();
  }

  async refresh(): Promise<void> {
    try {
      const dir = path.posix.join(this.workspaceRoot.replace(/\\/g, '/'), '.speckit/evidence');
      const list = await this.fs.listDir(dir).catch(() => [] as string[]);
      const jsons = list.filter((n) => n.endsWith('.json')).sort();
      if (jsons.length === 0) {
        this.collection.clear();
        return;
      }
      const newest = jsons[jsons.length - 1];
      const raw = await this.fs.readFile(`${dir}/${newest}`);
      const evidence = JSON.parse(raw) as RawEvidence;
      this.populate(evidence);
    } catch {
      // best-effort
    }
  }

  populate(evidence: RawEvidence): void {
    this.collection.clear();
    const byUri = new Map<string, vscode.Diagnostic[]>();
    for (const f of evidence.findings ?? []) {
      if (!f.path) continue;
      const full = path.isAbsolute(f.path) ? f.path : path.join(this.workspaceRoot, f.path);
      const uri = vscode.Uri.file(full);
      const lineNum = Math.max(0, (f.line ?? 1) - 1);
      const range = new vscode.Range(lineNum, 0, lineNum, Number.MAX_SAFE_INTEGER);
      const msg = `${f.message ?? '(sem mensagem)'}${f.suggestedFix ? `\nFix: ${f.suggestedFix}` : ''}`;
      const diag = new vscode.Diagnostic(range, msg, toVscodeSeverity(f.severity));
      diag.source = `speckit/${f.validator ?? 'auto'}`;
      const key = uri.toString();
      if (!byUri.has(key)) byUri.set(key, []);
      byUri.get(key)!.push(diag);
    }
    for (const [uriStr, diags] of byUri) {
      this.collection.set(vscode.Uri.parse(uriStr), diags);
    }
  }
}
