/**
 * SpecKit — Markdown to PDF converter
 * Usage: node convert.js [input.md] [output.pdf]
 * Defaults: README.md → markdown-to-pdf/SpecKit-README.pdf
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.resolve(ROOT, process.argv[2] || 'README.md');
const OUTPUT = process.argv[3]
  ? path.resolve(ROOT, process.argv[3])
  : path.resolve(__dirname, 'SpecKit-README.pdf');

if (!fs.existsSync(INPUT)) {
  console.error(`File not found: ${INPUT}`);
  process.exit(1);
}

const CONFIG = path.resolve(__dirname, '.md-to-pdf.js');
const STYLES = path.resolve(__dirname, 'styles.css');

console.log('');
console.log('  SpecKit — PDF Generator');
console.log('  ─────────────────────────────────────');
console.log(`  Input:  ${path.relative(ROOT, INPUT)}`);
console.log(`  Output: ${path.relative(ROOT, OUTPUT)}`);
console.log(`  Config: ${path.relative(ROOT, CONFIG)}`);
console.log(`  Styles: ${path.relative(ROOT, STYLES)}`);
console.log('');

// Build md-to-pdf config as JSON for --config-file
const config = require(CONFIG);

// We use the stylesheet from the config
const cssContent = fs.readFileSync(STYLES, 'utf8');

// Create a temporary markdown file that embeds the styles
const tempDir = path.resolve(__dirname, '.tmp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const mdContent = fs.readFileSync(INPUT, 'utf8');

// Inject a cover-like styled header and CSS directly via HTML
const styledMd = `<style>\n${cssContent}\n</style>\n\n${mdContent}`;

const tempMd = path.resolve(tempDir, 'README-styled.md');
fs.writeFileSync(tempMd, styledMd, 'utf8');

// Build the JSON config for md-to-pdf
const pdfConfig = {
  ...config,
  stylesheet: [], // already embedded
  dest: OUTPUT,
};

const tempConfig = path.resolve(tempDir, 'config.js');
fs.writeFileSync(tempConfig, `module.exports = ${JSON.stringify(pdfConfig, null, 2)};\n`, 'utf8');

console.log('  Generating PDF (this may take a moment on first run)...');
console.log('');

try {
  execSync(
    `npx --yes md-to-pdf --config-file "${tempConfig}" "${tempMd}"`,
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env },
      timeout: 120_000,
    },
  );

  // md-to-pdf outputs next to source by default; move if needed
  const defaultOutput = tempMd.replace(/\.md$/, '.pdf');
  if (fs.existsSync(defaultOutput) && defaultOutput !== OUTPUT) {
    fs.renameSync(defaultOutput, OUTPUT);
  }

  console.log('');
  console.log(`  ✅ PDF generated: ${path.relative(ROOT, OUTPUT)}`);
  console.log('');
} catch (err) {
  console.error('  ❌ PDF generation failed:', err.message);
  process.exit(1);
} finally {
  // Cleanup temp files
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) { /* ignore */ }
}
