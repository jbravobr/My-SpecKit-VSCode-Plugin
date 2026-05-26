const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
const rootDir = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(rootDir, 'docs/workflow-sprint-ssd.md'), 'utf8');
const body = md.render(source);

const header = [
  '<!DOCTYPE html>',
  '<html lang="pt-BR">',
  '<head>',
  '<meta charset="UTF-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
  '<title>Workflow Sprint SSD — Spec Driven Development com SpecKit</title>',
  '<style>',
  ':root{--bg:#fff;--fg:#1a1a2e;--accent:#4361ee;--border:#e0e0e0;--code-bg:#f5f5f5;--table-stripe:#f9f9fb;--bq-border:#4361ee}',
  '@media(prefers-color-scheme:dark){:root{--bg:#1a1a2e;--fg:#e0e0e0;--accent:#7c93f5;--border:#333;--code-bg:#16213e;--table-stripe:#16213e;--bq-border:#7c93f5}}',
  '*{box-sizing:border-box}',
  'body{font-family:"Segoe UI",-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.7;color:var(--fg);background:var(--bg);max-width:920px;margin:0 auto;padding:2rem 1.5rem}',
  'h1{font-size:2rem;border-bottom:3px solid var(--accent);padding-bottom:.5rem;margin-top:2rem}',
  'h2{font-size:1.5rem;border-bottom:1px solid var(--border);padding-bottom:.3rem;margin-top:2.5rem;color:var(--accent)}',
  'h3{font-size:1.2rem;margin-top:1.8rem}',
  'a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}',
  'code{background:var(--code-bg);padding:.15em .4em;border-radius:4px;font-size:.9em;font-family:"Cascadia Code","Fira Code","JetBrains Mono",monospace}',
  'pre{background:var(--code-bg);border:1px solid var(--border);border-radius:8px;padding:1rem 1.2rem;overflow-x:auto;line-height:1.5}',
  'pre code{background:none;padding:0;font-size:.85em}',
  'blockquote{border-left:4px solid var(--bq-border);margin:1rem 0;padding:.5rem 1rem;background:var(--code-bg);border-radius:0 8px 8px 0}',
  'table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.9em}',
  'th{background:var(--accent);color:#fff;padding:.6rem .8rem;text-align:left}',
  'td{padding:.5rem .8rem;border-bottom:1px solid var(--border)}',
  'tr:nth-child(even){background:var(--table-stripe)}',
  'hr{border:none;border-top:1px solid var(--border);margin:2rem 0}',
  'ul,ol{padding-left:1.5rem}',
  'li{margin-bottom:.3rem}',
  'input[type=checkbox]{margin-right:.4rem}',
  'strong{font-weight:600}',
  '</style>',
  '</head>',
  '<body>',
  ''
].join('\n');

const footer = '\n</body>\n</html>\n';

fs.writeFileSync(path.join(rootDir, 'docs/workflow-sprint-ssd.html'), header + body + footer, 'utf8');
console.log('HTML generated successfully: docs/workflow-sprint-ssd.html');
