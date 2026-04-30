import console from 'console';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import process from 'process';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;
const expectedTechnicalFile = `CHANGELOG-${version}.txt`;
const expectedUserFile = `CHANGELOG-USER-${version}.txt`;
const publishDir = resolve(root, 'publish');

function fail(msg) {
  console.error('\n❌ Changelog obrigatório ausente.');
  console.error(msg);
  console.error(
    `\nCrie os arquivos "${expectedTechnicalFile}" e "${expectedUserFile}" em uma pasta publish/${version}* antes de empacotar.`,
  );
  console.error('Conteúdo mínimo: descrição em pt-BR das mudanças desta versão (>= 80 chars por arquivo).\n');
  process.exit(1);
}

function hasRequiredContent(dir, fileName) {
  const file = join(dir, fileName);
  if (!existsSync(file)) return false;
  const content = readFileSync(file, 'utf8').trim();
  return content.length >= 80;
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
  return hasRequiredContent(dir, expectedTechnicalFile) && hasRequiredContent(dir, expectedUserFile);
});

if (!found) {
  fail(
    `Encontrado(s): ${candidates.map((c) => c.replace(root + '\\', '').replace(root + '/', '')).join(', ')}\n` +
      `Mas nenhum contém "${expectedTechnicalFile}" e "${expectedUserFile}" com conteúdo mínimo (>= 80 chars cada).`,
  );
}

console.log(
  `✅ Changelogs validados: ${join(found, expectedTechnicalFile).replace(root + '\\', '').replace(root + '/', '')} + ${join(found, expectedUserFile).replace(root + '\\', '').replace(root + '/', '')}`,
);
