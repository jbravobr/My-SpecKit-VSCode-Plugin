import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = resolve(process.cwd(), 'scripts', 'check-changelog.mjs');
const releaseText =
  'Conteúdo em português com descrição suficiente das mudanças técnicas desta versão para cumprir a validação mínima obrigatória.';
const userReleaseText =
  'Novidades para usuários do plugin: comandos novos, correções visíveis e melhorias práticas explicadas sem detalhes internos.';

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
    writeFileSync(join(releaseDir, `CHANGELOG-${version}.txt`), releaseText, 'utf8');
    writeFileSync(join(releaseDir, `CHANGELOG-USER-${version}.txt`), userReleaseText, 'utf8');

    const result = runCheck(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`CHANGELOG-${version}.txt`);
    expect(result.stdout).toContain(`CHANGELOG-USER-${version}.txt`);
  });

  it('fails when the user-oriented changelog is missing', () => {
    const { root, version, releaseDir } = createReleaseRoot();
    writeFileSync(join(releaseDir, `CHANGELOG-${version}.txt`), releaseText, 'utf8');

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
    writeFileSync(join(releaseDir, `CHANGELOG-${version}.txt`), releaseText, 'utf8');
    writeFileSync(join(releaseDir, `CHANGELOG-USER-${version}.txt`), userReleaseText, 'utf8');

    const result = runCheck(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`publish${resolve('/') === '/' ? '/' : '\\'}${version}-rc1`);
  });
});
