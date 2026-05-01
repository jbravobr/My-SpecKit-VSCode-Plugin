import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = resolve(process.cwd(), 'scripts', 'check-changelog.mjs');

function buildTechnicalChangelog(version: string): string {
  return `SpecKit — Changelog ${version}
===========================
Data: 01/05/2026
Branch base: release/${version}

PATCH — Exemplo de release
--------------------------
Mudança técnica exemplificativa para validar o padrão obrigatório.

Resumo da release
-----------------
Resumo técnico em português com contexto da entrega.

Mudanças técnicas
-----------------
- Ajuste técnico 1.
- Ajuste técnico 2.

Documentação
------------
- README atualizado.

Testes adicionados
------------------
- Teste unitário de exemplo.

Validação executada antes do release
------------------------------------
- npx tsc --noEmit -> 0 erros

Artefato gerado
---------------
- publish/${version}/vscode-plugin-speckit-${version}.vsix`;
}

function buildUserChangelog(version: string): string {
  return `SpecKit — Novidades para usuários — ${version}
==========================================
Data: 01/05/2026

Resumo
------
Resumo objetivo da novidade para usuários finais.

Novas features
--------------
- Nova feature de exemplo.

Melhorias de experiência
------------------------
- Melhoria prática de uso.

Correções e segurança de release
--------------------------------
- Correção operacional de exemplo.

Como usar rapidamente
---------------------
1. Execute o comando de exemplo.

Artefato
--------
- publish/${version}/vscode-plugin-speckit-${version}.vsix`;
}

const tempRoots: string[] = [];

function createReleaseRoot(version = '1.2.3') {
  const root = mkdtempSync(join(tmpdir(), 'speckit-changelog-'));
  tempRoots.push(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version }), 'utf8');
  mkdirSync(join(root, 'publish', version), { recursive: true });
  return { root, version, releaseDir: join(root, 'publish', version) };
}

function runCheck(root: string) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('check-changelog release guard', () => {
  it('requires both technical and user-oriented changelogs', () => {
    const { root, version, releaseDir } = createReleaseRoot();
    writeFileSync(
      join(releaseDir, `CHANGELOG-${version}.txt`),
      buildTechnicalChangelog(version),
      'utf8',
    );
    writeFileSync(
      join(releaseDir, `CHANGELOG-USER-${version}.txt`),
      buildUserChangelog(version),
      'utf8',
    );

    const result = runCheck(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`CHANGELOG-${version}.txt`);
    expect(result.stdout).toContain(`CHANGELOG-USER-${version}.txt`);
  });

  it('fails when the user-oriented changelog is missing', () => {
    const { root, version, releaseDir } = createReleaseRoot();
    writeFileSync(
      join(releaseDir, `CHANGELOG-${version}.txt`),
      buildTechnicalChangelog(version),
      'utf8',
    );

    const result = runCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`CHANGELOG-${version}.txt`);
    expect(result.stderr).toContain(`CHANGELOG-USER-${version}.txt`);
  });

  it('accepts version-suffixed publish folders when both changelogs are present', () => {
    const { root, version } = createReleaseRoot();
    rmSync(join(root, 'publish', version), { recursive: true, force: true });
    const releaseDir = join(root, 'publish', `${version}-rc1`);
    mkdirSync(releaseDir, { recursive: true });
    writeFileSync(
      join(releaseDir, `CHANGELOG-${version}.txt`),
      buildTechnicalChangelog(version),
      'utf8',
    );
    writeFileSync(
      join(releaseDir, `CHANGELOG-USER-${version}.txt`),
      buildUserChangelog(version),
      'utf8',
    );

    const result = runCheck(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`publish${resolve('/') === '/' ? '/' : '\\'}${version}-rc1`);
  });

  it('fails when technical changelog is outside the mandatory format', () => {
    const { root, version, releaseDir } = createReleaseRoot();
    const malformed = buildTechnicalChangelog(version).replace(
      'Resumo da release\n-----------------',
      'Resumo',
    );
    writeFileSync(join(releaseDir, `CHANGELOG-${version}.txt`), malformed, 'utf8');
    writeFileSync(
      join(releaseDir, `CHANGELOG-USER-${version}.txt`),
      buildUserChangelog(version),
      'utf8',
    );

    const result = runCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Seção técnica obrigatória ausente');
    expect(result.stderr).toContain('Resumo da release');
  });

  it('fails when user changelog is outside the mandatory format', () => {
    const { root, version, releaseDir } = createReleaseRoot();
    const malformed = buildUserChangelog(version).replace(
      'Como usar rapidamente\n---------------------',
      'Como usar',
    );
    writeFileSync(
      join(releaseDir, `CHANGELOG-${version}.txt`),
      buildTechnicalChangelog(version),
      'utf8',
    );
    writeFileSync(join(releaseDir, `CHANGELOG-USER-${version}.txt`), malformed, 'utf8');

    const result = runCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Seção de usuário obrigatória ausente');
    expect(result.stderr).toContain('Como usar rapidamente');
  });
});
