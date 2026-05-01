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
const technicalTitleRegex = new RegExp(`^SpecKit\\s+[—-]\\s+Changelog\\s+${escapeRegex(version)}$`);
const userTitleRegex = new RegExp(`^SpecKit\\s+[—-]\\s+Novidades para usuários\\s+[—-]\\s+${escapeRegex(version)}$`);

const REQUIRED_TECHNICAL_SECTIONS = [
  'Resumo da release',
  'Mudanças técnicas',
  'Documentação',
  'Testes adicionados',
  'Validação executada antes do release',
  'Artefato gerado',
];

const REQUIRED_USER_SECTIONS = [
  'Resumo',
  'Novas features',
  'Melhorias de experiência',
  'Correções e segurança de release',
  'Como usar rapidamente',
  'Artefato',
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toRelativePath(path) {
  return path.replace(root + '\\', '').replace(root + '/', '');
}

function hasSectionWithUnderline(content, section) {
  const sectionRegex = new RegExp(
    `(^|\\r?\\n)${escapeRegex(section)}\\r?\\n-{3,}(\\r?\\n|$)`,
    'm',
  );
  return sectionRegex.test(content);
}

function hasArtifactLine(content) {
  const artifactRegex = new RegExp(
    `^\\-\\s+publish/${escapeRegex(version)}/vscode-plugin-speckit-${escapeRegex(version)}\\.vsix$`,
    'm',
  );
  return artifactRegex.test(content);
}

function validateTechnicalFormat(content) {
  const lines = content.split(/\r?\n/);
  const errors = [];

  if (!technicalTitleRegex.test((lines[0] ?? '').trim())) {
    errors.push(`Título técnico inválido. Esperado: "SpecKit — Changelog ${version}".`);
  }

  if (!/^={10,}$/.test((lines[1] ?? '').trim())) {
    errors.push('Linha 2 deve conter sublinhado com "=".');
  }

  if (!/^Data:\s\d{2}\/\d{2}\/\d{4}$/m.test(content)) {
    errors.push('Campo "Data" ausente ou fora do formato DD/MM/AAAA.');
  }

  if (!/^Branch base:\s.+$/m.test(content)) {
    errors.push('Campo "Branch base" obrigatório no changelog técnico.');
  }

  if (!/^(RELEASE|PATCH|HOTFIX|MINOR|MAJOR)\s+[—-]\s+.+$/m.test(content)) {
    errors.push('Título de tipo de release obrigatório (RELEASE/PATCH/HOTFIX/MINOR/MAJOR).');
  }

  for (const section of REQUIRED_TECHNICAL_SECTIONS) {
    if (!hasSectionWithUnderline(content, section)) {
      errors.push(`Seção técnica obrigatória ausente: "${section}".`);
    }
  }

  if (!hasArtifactLine(content)) {
    errors.push(`Linha de artefato obrigatória ausente: publish/${version}/vscode-plugin-speckit-${version}.vsix`);
  }

  return errors;
}

function validateUserFormat(content) {
  const lines = content.split(/\r?\n/);
  const errors = [];

  if (!userTitleRegex.test((lines[0] ?? '').trim())) {
    errors.push(`Título de usuário inválido. Esperado: "SpecKit — Novidades para usuários — ${version}".`);
  }

  if (!/^={10,}$/.test((lines[1] ?? '').trim())) {
    errors.push('Linha 2 deve conter sublinhado com "=".');
  }

  if (!/^Data:\s\d{2}\/\d{2}\/\d{4}$/m.test(content)) {
    errors.push('Campo "Data" ausente ou fora do formato DD/MM/AAAA.');
  }

  for (const section of REQUIRED_USER_SECTIONS) {
    if (!hasSectionWithUnderline(content, section)) {
      errors.push(`Seção de usuário obrigatória ausente: "${section}".`);
    }
  }

  if (!hasArtifactLine(content)) {
    errors.push(`Linha de artefato obrigatória ausente: publish/${version}/vscode-plugin-speckit-${version}.vsix`);
  }

  return errors;
}

function validateCandidateDir(dir) {
  const technicalPath = join(dir, expectedTechnicalFile);
  const userPath = join(dir, expectedUserFile);
  const errors = [];

  if (!existsSync(technicalPath)) {
    errors.push(`Arquivo ausente: ${toRelativePath(technicalPath)}`);
  }
  if (!existsSync(userPath)) {
    errors.push(`Arquivo ausente: ${toRelativePath(userPath)}`);
  }

  if (errors.length > 0) {
    return { dir, valid: false, errors };
  }

  const technicalContent = readFileSync(technicalPath, 'utf8').trim();
  const userContent = readFileSync(userPath, 'utf8').trim();

  if (technicalContent.length < 80) {
    errors.push(`Conteúdo insuficiente: ${toRelativePath(technicalPath)} (mínimo 80 caracteres).`);
  }
  if (userContent.length < 80) {
    errors.push(`Conteúdo insuficiente: ${toRelativePath(userPath)} (mínimo 80 caracteres).`);
  }

  errors.push(...validateTechnicalFormat(technicalContent).map((err) => `[Técnico] ${err}`));
  errors.push(...validateUserFormat(userContent).map((err) => `[Usuário] ${err}`));

  return { dir, valid: errors.length === 0, errors };
}

function fail(msg) {
  console.error('\n❌ Changelog inválido para release.');
  console.error(msg);
  console.error(
    `\nCrie os arquivos "${expectedTechnicalFile}" e "${expectedUserFile}" em uma pasta publish/${version}* antes de empacotar.`,
  );
  console.error('Formato obrigatório com seções completas (técnico e usuário) + conteúdo mínimo (>= 80 chars por arquivo).\n');
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

const validations = candidates.map((dir) => validateCandidateDir(dir));
const valid = validations.find((entry) => entry.valid);

if (!valid) {
  const details = validations
    .map((entry) => {
      const rel = toRelativePath(entry.dir);
      const reason = entry.errors.map((err) => `  - ${err}`).join('\n');
      return `- ${rel}\n${reason}`;
    })
    .join('\n');

  fail(
    `Encontrado(s): ${candidates.map((c) => toRelativePath(c)).join(', ')}\n` +
      `Nenhum candidato atende ao padrão obrigatório:\n${details}`,
  );
}

console.log(
  `✅ Changelogs validados: ${toRelativePath(join(valid.dir, expectedTechnicalFile))} + ${toRelativePath(join(valid.dir, expectedUserFile))}`,
);
