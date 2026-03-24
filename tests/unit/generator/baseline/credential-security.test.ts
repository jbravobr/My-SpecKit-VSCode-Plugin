import { describe, it, expect } from 'vitest';
import { generateCredentialSecurity } from '../../../../src/generator/baseline/CredentialSecurityGenerator';

describe('CredentialSecurityGenerator', () => {
  it('returns non-empty string', () => {
    const result = generateCredentialSecurity();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains applyTo frontmatter', () => {
    expect(generateCredentialSecurity()).toContain('applyTo');
  });

  it('covers IAM roles over access keys', () => {
    const result = generateCredentialSecurity();
    expect(result).toContain('IAM roles');
    expect(result).toContain('access keys');
    expect(result).toContain('Instance Profile');
  });

  it('covers AWS Secrets Manager, Azure Key Vault and HashiCorp Vault', () => {
    const result = generateCredentialSecurity();
    expect(result).toContain('SecretsManager');
    expect(result).toContain('Key Vault');
    expect(result).toContain('Vault');
  });

  it('prohibits secrets in git history, logs and env vars', () => {
    const result = generateCredentialSecurity();
    expect(result).toContain('git');
    expect(result).toContain('log');
    expect(result).toContain('Variáveis de ambiente');
  });

  it('covers masking of sensitive log fields', () => {
    const result = generateCredentialSecurity();
    expect(result).toContain('password');
    expect(result).toContain('token');
    expect(result).toContain('secret');
  });

  it('covers credential rotation', () => {
    const result = generateCredentialSecurity();
    expect(result).toContain('rotação');
    expect(result).toContain('90 dias');
  });

  it('covers pre-commit hook for secret detection', () => {
    const result = generateCredentialSecurity();
    expect(result).toContain('git-secrets');
    expect(result).toContain('trufflehog');
  });
});
