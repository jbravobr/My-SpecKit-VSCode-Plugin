import type { Finding, Validator, ValidatorContext } from './types';

export interface SecretRule {
  id: string;
  label: string;
  pattern: RegExp;
  severity: 'warn' | 'error' | 'blocker';
}

export const DEFAULT_SECRET_RULES: SecretRule[] = [
  {
    id: 'aws-access-key',
    label: 'AWS Access Key ID',
    pattern: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/,
    severity: 'blocker',
  },
  {
    id: 'aws-secret',
    label: 'AWS Secret Access Key (atribuição)',
    pattern: /aws[_-]?secret[_-]?access[_-]?key\s*[=:]\s*['"][A-Za-z0-9/+=]{30,}['"]/i,
    severity: 'blocker',
  },
  {
    id: 'private-key-block',
    label: 'PEM Private Key Block',
    pattern: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH|PGP)?\s*PRIVATE KEY-----/,
    severity: 'blocker',
  },
  {
    id: 'github-token',
    label: 'GitHub Token',
    pattern: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/,
    severity: 'blocker',
  },
  {
    id: 'slack-token',
    label: 'Slack Token',
    pattern: /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/,
    severity: 'error',
  },
  {
    id: 'google-api-key',
    label: 'Google API Key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
    severity: 'error',
  },
  {
    id: 'generic-api-key-assignment',
    label: 'API key / token / secret hardcoded',
    pattern: /\b(api[_-]?key|secret|token|password|passwd)\s*[=:]\s*['"][A-Za-z0-9/+=_-]{16,}['"]/i,
    severity: 'warn',
  },
  {
    id: 'jwt-token',
    label: 'JWT (header.payload.signature)',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
    severity: 'warn',
  },
];

const DEFAULT_FILE_GLOBS = /\.(ts|tsx|js|jsx|java|kt|py|cs|go|rb|php|env|json|yml|yaml)$/i;
const DEFAULT_SKIP_PATH = /(^|\/)(node_modules|dist|out|build|coverage|\.speckit|\.git)\//;
const DEFAULT_SKIP_TEST = /\.(test|spec)\.(ts|tsx|js|jsx)$/i;
const MAX_FILE_BYTES = 256 * 1024;

export interface SecretLeakValidatorOptions {
  rules?: SecretRule[];
  filePattern?: RegExp;
  skipPathPattern?: RegExp;
  skipTestFiles?: boolean;
  maxBytesPerFile?: number;
}

function isLikelyPlaceholder(snippet: string): boolean {
  return /(\$\{|\{\{|<your|placeholder|changeme|dummy_secret|fake_secret|xxxxxx|0000000)/i.test(
    snippet,
  );
}

export class SecretLeakValidator implements Validator {
  readonly id = 'secret-leak';
  readonly description =
    'Varre arquivos da story por padrões de segredos hardcoded (AWS, GitHub, JWT, chaves privadas, etc.) e bloqueia commit antes do code review.';

  private readonly rules: SecretRule[];
  private readonly filePattern: RegExp;
  private readonly skipPathPattern: RegExp;
  private readonly skipTestFiles: boolean;
  private readonly maxBytes: number;

  constructor(options: SecretLeakValidatorOptions = {}) {
    this.rules = options.rules ?? DEFAULT_SECRET_RULES;
    this.filePattern = options.filePattern ?? DEFAULT_FILE_GLOBS;
    this.skipPathPattern = options.skipPathPattern ?? DEFAULT_SKIP_PATH;
    this.skipTestFiles = options.skipTestFiles ?? true;
    this.maxBytes = options.maxBytesPerFile ?? MAX_FILE_BYTES;
  }

  async run(ctx: ValidatorContext): Promise<Finding[]> {
    const files = (ctx.storyFiles ?? []).filter((f) => {
      if (!this.filePattern.test(f)) return false;
      if (this.skipPathPattern.test(f.replace(/\\/g, '/'))) return false;
      if (this.skipTestFiles && DEFAULT_SKIP_TEST.test(f)) return false;
      return true;
    });
    if (files.length === 0) return [];

    const findings: Finding[] = [];
    for (const file of files) {
      if (ctx.signal?.aborted) break;
      let content: string;
      try {
        content = await ctx.fs.readFile(file);
      } catch {
        continue;
      }
      if (content.length > this.maxBytes) {
        content = content.slice(0, this.maxBytes);
      }
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length === 0) continue;
        for (const rule of this.rules) {
          const match = rule.pattern.exec(line);
          if (!match) continue;
          if (isLikelyPlaceholder(line)) continue;
          findings.push({
            validator: this.id,
            severity: rule.severity,
            message: `${rule.label} detectado em código-fonte.`,
            path: file,
            line: i + 1,
            suggestedFix:
              'Remover o segredo do código, rotacionar a credencial vazada e movê-la para variável de ambiente ou cofre de segredos.',
            metadata: { ruleId: rule.id, snippet: line.trim().slice(0, 120) },
          });
        }
      }
    }
    return findings;
  }
}
