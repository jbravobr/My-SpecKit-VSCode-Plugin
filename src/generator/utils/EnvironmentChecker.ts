import { execSync } from 'child_process';
import { TechStackDetection } from '../../fix/Fix';

export const INSTALL_URLS: Record<string, string> = {
  'Git': 'https://git-scm.com/downloads',
  'Node.js': 'https://nodejs.org',
  'npm': 'https://nodejs.org',
  'Python': 'https://python.org/downloads',
  'pip': 'https://pip.pypa.io/en/stable/installation/',
  'Java': 'https://adoptium.net',
  'Maven': 'https://maven.apache.org/download.cgi',
  '.NET': 'https://dotnet.microsoft.com/download',
};

export interface ToolResult {
  name: string;
  cmd: string;
  available: boolean;
  version?: string;
  required: boolean;
}

export interface EnvironmentReport {
  tools: ToolResult[];
  stackLanguage?: string;
}

type ToolDef = { name: string; cmd: string; fallback?: string };

const CORE_TOOLS: ToolDef[] = [
  { name: 'Git', cmd: 'git --version' },
];

const NODEJS_TOOLS: ToolDef[] = [
  { name: 'Node.js', cmd: 'node --version' },
  { name: 'npm', cmd: 'npm --version' },
];

const PYTHON_TOOLS: ToolDef[] = [
  { name: 'Python', cmd: 'python3 --version', fallback: 'python --version' },
  { name: 'pip', cmd: 'pip3 --version', fallback: 'pip --version' },
];

const JAVA_TOOLS: ToolDef[] = [
  { name: 'Java', cmd: 'java -version' },
  { name: 'Maven', cmd: 'mvn --version' },
];

const DOTNET_TOOLS: ToolDef[] = [
  { name: '.NET', cmd: 'dotnet --version' },
];

export function probe(cmd: string): { available: boolean; version?: string } {
  try {
    const out = execSync(cmd, { timeout: 3000, stdio: 'pipe' }).toString().trim();
    const version = out.match(/\d+\.\d+\.?\d*/)?.[0];
    return { available: true, version };
  } catch {
    return { available: false };
  }
}

function checkTool(def: ToolDef, required: boolean): ToolResult {
  let result = probe(def.cmd);
  if (!result.available && def.fallback) {
    result = probe(def.fallback);
  }
  return { name: def.name, cmd: def.cmd, available: result.available, version: result.version, required };
}

export function checkEnvironment(stack?: TechStackDetection): EnvironmentReport {
  const lang = stack?.language;
  const noStack = !lang;
  const results: ToolResult[] = [];

  for (const tool of CORE_TOOLS) {
    results.push(checkTool(tool, true));
  }

  const nodeRequired = lang === 'typescript' || lang === 'javascript';
  if (nodeRequired || noStack) {
    for (const tool of NODEJS_TOOLS) {
      results.push(checkTool(tool, nodeRequired));
    }
  }

  const pythonRequired = lang === 'python';
  if (pythonRequired || noStack) {
    for (const tool of PYTHON_TOOLS) {
      results.push(checkTool(tool, pythonRequired));
    }
  }

  const javaRequired = lang === 'java';
  if (javaRequired || noStack) {
    for (const tool of JAVA_TOOLS) {
      results.push(checkTool(tool, javaRequired));
    }
  }

  const dotnetRequired = lang === 'csharp';
  if (dotnetRequired || noStack) {
    for (const tool of DOTNET_TOOLS) {
      results.push(checkTool(tool, dotnetRequired));
    }
  }

  return { tools: results, stackLanguage: lang };
}

export function formatEnvCheckInline(report: EnvironmentReport): string {
  const required = report.tools.filter(t => t.required);
  const missing = required.filter(t => !t.available);

  if (required.length === 0) {
    return '';
  }

  if (missing.length === 0) {
    const names = required.map(t => t.version ? `${t.name} ${t.version}` : t.name).join(', ');
    return `✅ **Ambiente verificado** — ${names} ${required.length === 1 ? 'disponível' : 'disponíveis'}.\n\n`;
  }

  const lines = ['⚠️ **Ferramentas ausentes para implementação:**\n'];
  for (const t of missing) {
    const url = INSTALL_URLS[t.name];
    lines.push(`- **${t.name}**: ${url ? `instalar em ${url}` : 'instalar e adicionar ao PATH'}`);
  }
  lines.push('\n');
  return lines.join('\n');
}
