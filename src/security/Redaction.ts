const REDACTION_TOKEN = '[REDACTED]';

const PEM_BLOCK_RE =
  /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PGP)?\s*PRIVATE KEY-----[\s\S]*?-----END\s+(?:RSA|EC|DSA|OPENSSH|PGP)?\s*PRIVATE KEY-----/g;
const AWS_ACCESS_KEY_RE = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g;
const GITHUB_TOKEN_RE = /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g;
const SLACK_TOKEN_RE = /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g;
const GOOGLE_API_KEY_RE = /\bAIza[0-9A-Za-z_-]{35}\b/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi;
const CREDENTIAL_ASSIGNMENT_RE =
  /(\b(?:api[_-]?key|secret|token|password|passwd|authorization|credential)\b\s*[=:]\s*['"])([^'"]+)(['"])/gi;
const BASIC_AUTH_URL_RE = /(https?:\/\/)([^/\s:@]+):([^/\s:@]+)@/gi;

export function redactSensitiveText(value: string): string {
  return value
    .replace(PEM_BLOCK_RE, REDACTION_TOKEN)
    .replace(AWS_ACCESS_KEY_RE, REDACTION_TOKEN)
    .replace(GITHUB_TOKEN_RE, REDACTION_TOKEN)
    .replace(SLACK_TOKEN_RE, REDACTION_TOKEN)
    .replace(GOOGLE_API_KEY_RE, REDACTION_TOKEN)
    .replace(JWT_RE, REDACTION_TOKEN)
    .replace(BEARER_RE, 'Bearer [REDACTED]')
    .replace(CREDENTIAL_ASSIGNMENT_RE, `$1${REDACTION_TOKEN}$3`)
    .replace(BASIC_AUTH_URL_RE, '$1[REDACTED]:[REDACTED]@');
}

export function redactSensitiveUnknown(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveUnknown(item));
  }

  if (value && typeof value === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      redacted[key] = redactSensitiveUnknown(nested);
    }
    return redacted;
  }

  return value;
}

export { REDACTION_TOKEN };
