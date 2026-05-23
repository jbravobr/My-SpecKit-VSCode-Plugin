#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

async function load(rel) {
  return import('file://' + resolve(root, rel).replace(/\\/g, '/'));
}

function metrics(label, content) {
  const text = typeof content === 'string' ? content : '';
  const lines = text.split('\n');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  const description = fm ? (fm[1].match(/description:\s*"([^"]*)"/) || [, ''])[1] : '';
  const h1 = lines.filter((l) => /^#\s/.test(l)).length;
  const h2 = lines.filter((l) => /^##\s/.test(l)).length;
  return {
    label,
    lines: lines.length,
    chars: text.length,
    h1,
    h2,
    descriptionLength: description.length,
    descriptionStartsWithUseWhen:
      /(^|\s)Use when/i.test(description) || /(^|\s)Use quando/i.test(description),
  };
}

const storyMod = await load('out/integration/src/story/Story.js');
const story = storyMod.emptyStory();
story.metadata.id = 'STORY-001';
story.metadata.title = 'Sample';
story.technicalSpec.language = 'java';
story.technicalSpec.framework = 'spring-boot';
story.technicalSpec.database = 'postgres';
story.technicalSpec.infrastructure = 'aws';

const results = [];

const baseline = await load('out/integration/src/generator/skill/BaselineSkillGenerator.js');
const baselineFiles = baseline.generateBaselineSkill();
for (const f of baselineFiles) {
  results.push(metrics(`speckit-baseline/${f.filename}`, f.content));
}

const stack = await load('out/integration/src/generator/skill/StackSkillGenerator.js');
results.push(
  metrics(
    'speckit-stack',
    stack.generateStackSkill(
      { language: 'java', framework: 'springboot', infrastructure: 'aws', database: 'postgres' },
      story,
    ),
  ),
);

const ctx = await load('out/integration/src/generator/skill/StoryContextSkillGenerator.js');
results.push(metrics('speckit-context', ctx.generateStoryContextSkill(story)));

const corp = await load('out/integration/src/generator/corp/CorpSkillsGenerator.js');
const corpList = corp.generateCorpSkills(story);
for (const s of corpList) {
  results.push(metrics(s.name || s.filename || 'corp', s.content));
}

const out = {
  generatedAt: new Date().toISOString(),
  pluginVersion: '0.5.1',
  results,
};

const outPath = resolve(root, 'publish/skill-metrics-baseline.json');
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`\nSummary:`);
for (const r of results) {
  console.log(
    `  ${r.label.padEnd(40)} lines=${String(r.lines).padStart(4)}  chars=${String(r.chars).padStart(6)}  H1=${r.h1} H2=${r.h2}  useWhen=${r.descriptionStartsWithUseWhen}`,
  );
}
