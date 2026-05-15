#!/usr/bin/env node

import { execFileSync } from 'child_process';
import path from 'path';

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.env',
  '.txt',
  '.properties',
]);

const ALLOWLIST_PATHS = [
  /^tests\/unit\/validator\/auto\/SecretLeakValidator\.test\.ts$/i,
  /^tests\/unit\/workflow\/AuditLogger\.test\.ts$/i,
  /^tests\/unit\/workflow\/EvidenceReportWriter\.test\.ts$/i,
  /^tests\/unit\/workflow\/TraceabilityManager\.test\.ts$/i,
  /^tests\/unit\/workflow\/TransitionGovernance\.test\.ts$/i,
];

const SECRET_RULES = [
  { id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'github-token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/ },
  { id: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'private-key-block', pattern: /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PGP)?\s*PRIVATE KEY-----/ },
  { id: 'generic-credential-assignment', pattern: /\b(?:api[_-]?key|secret|token|password|passwd)\s*[=:]\s*['"][^'"]{16,}['"]/i },
];

function listStagedFiles() {
  const stdout = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, '/'));
}

function shouldScan(filePath) {
  if (ALLOWLIST_PATHS.some((pattern) => pattern.test(filePath))) return false;
  const extension = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(extension);
}

function readStagedFile(filePath) {
  return execFileSync('git', ['show', `:${filePath}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024,
  });
}

function findMatches(filePath, content) {
  const matches = [];
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const rule of SECRET_RULES) {
      if (!rule.pattern.test(line)) continue;
      matches.push({
        filePath,
        line: index + 1,
        ruleId: rule.id,
      });
      break;
    }
  }
  return matches;
}

function main() {
  const stagedFiles = listStagedFiles().filter(shouldScan);
  if (stagedFiles.length === 0) return;

  const findings = [];
  for (const filePath of stagedFiles) {
    try {
      const content = readStagedFile(filePath);
      findings.push(...findMatches(filePath, content));
    } catch {
      // Ignore deleted/binary/unreadable entries from index for staged scan.
    }
  }

  if (findings.length === 0) return;

  globalThis.console.error('❌ Secret scan bloqueou o commit. Possíveis segredos detectados:');
  for (const finding of findings) {
    globalThis.console.error(
      `- ${finding.filePath}:${finding.line} (${finding.ruleId}) — remova/mascare o valor e rotacione a credencial se real.`,
    );
  }
  globalThis.console.error(
    '\nSe for fixture de teste intencional, ajuste a allowlist em scripts/scan-secrets-staged.mjs.',
  );
  globalThis.process.exit(1);
}

main();
