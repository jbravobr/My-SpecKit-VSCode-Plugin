import console from 'console';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import process from 'process';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;
const expectedFile = `CHANGELOG-${version}.txt`;
const publishDir = resolve(root, 'publish');

function fail(msg) {
  console.error('\n❌ Changelog obrigatório ausente.');
  console.error(msg);
  console.error(`\nCrie o arquivo "${expectedFile}" em uma pasta publish/${version}* antes de empacotar.`);
  console.error('Conteúdo mínimo: descrição em pt-BR das mudanças desta versão.\n');
  process.exit(1);
}

if (!existsSync(publishDir)) {
  fail(`Diretório publish/ não encontrado.`);
}

const candidates = readdirSync(publishDir)
  .filter((entry) => entry === version || entry.startsWith(`${version}-`) || entry.startsWith(`${version}_`))
  .map((entry) => join(publishDir, entry))
  .filter((p) => statSync(p).isDirectory());

if (candidates.length === 0) {
  fail(`Nenhuma pasta publish/${version}* encontrada.`);
}

const found = candidates.find((dir) => {
  const file = join(dir, expectedFile);
  if (!existsSync(file)) return false;
  const content = readFileSync(file, 'utf8').trim();
  return content.length >= 80;
});

if (!found) {
  fail(
    `Encontrado(s): ${candidates.map((c) => c.replace(root + '\\', '').replace(root + '/', '')).join(', ')}\n` +
      `Mas nenhum contém "${expectedFile}" com conteúdo mínimo (>= 80 chars).`,
  );
}

console.log(`✅ Changelog validado: ${join(found, expectedFile).replace(root + '\\', '').replace(root + '/', '')}`);
