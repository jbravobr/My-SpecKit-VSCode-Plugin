/**
 * Regression tests: parser robustness against non-LF line endings.
 *
 * Root cause (found 2026-03-27): buildSectionMap split on '\n' without
 * normalising Windows CRLF (\r\n), causing every heading and separator
 * to carry a trailing \r and fail all regex matches.  The same latent
 * bug existed in parseMetaFields for CR-only (\r) input.
 *
 * All variants are derived programmatically from the LF fixture so no
 * extra fixture files are needed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseStory } from '../../../src/story/StoryParser';
import { parseFix } from '../../../src/fix/FixParser';

const fixturesDir = resolve(__dirname, '../../fixtures');

// Normalise to LF unconditionally so the baseline is stable regardless of
// what line endings the fixture files have on disk (Git autocrlf, OS, editor).
const normalize = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const storyLF  = normalize(readFileSync(resolve(fixturesDir, 'story-complete-h4.md'), 'utf-8'));
const fixLF    = normalize(readFileSync(resolve(fixturesDir, 'fix-complete-h4.md'),   'utf-8'));

const toCRLF  = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
const toCR    = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r');
/** Alternates \r\n and \n every other line — simulates copy-paste mixed content. */
const toMixed = (s: string) => {
  const lines = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.map((l, i) => (i % 2 === 0 ? l + '\r\n' : l + '\n')).join('');
};

// ---------------------------------------------------------------------------
// parseStory — line ending variants
// ---------------------------------------------------------------------------

describe('parseStory — line ending robustness', () => {
  const baseline = parseStory(storyLF);

  it('parses CRLF (\\r\\n — Windows) identically to LF', () => {
    const story = parseStory(toCRLF(storyLF));

    expect(story.metadata.id).toBe(baseline.metadata.id);
    expect(story.metadata.title).toBe(baseline.metadata.title);
    expect(story.businessRequirement.problem).toBe(baseline.businessRequirement.problem);
    expect(story.businessRequirement.stakeholders).toEqual(baseline.businessRequirement.stakeholders);
    expect(story.functionalSpec.userStories).toEqual(baseline.functionalSpec.userStories);
    expect(story.functionalSpec.acceptanceCriteria).toEqual(baseline.functionalSpec.acceptanceCriteria);
    expect(story.nonFunctionalSpec.performance).toBe(baseline.nonFunctionalSpec.performance);
    expect(story.technicalSpec.language).toBe(baseline.technicalSpec.language);
    expect(story.technicalSpec.framework).toBe(baseline.technicalSpec.framework);
    expect(story.technicalSpec.architecture).toBe(baseline.technicalSpec.architecture);
    expect(story.dor.criteria).toEqual(baseline.dor.criteria);
    expect(story.dor.checked).toEqual(baseline.dor.checked);
    expect(story.dod.criteria).toEqual(baseline.dod.criteria);
  });

  it('parses CR-only (\\r — classic Mac) identically to LF', () => {
    const story = parseStory(toCR(storyLF));

    expect(story.metadata.id).toBe(baseline.metadata.id);
    expect(story.metadata.title).toBe(baseline.metadata.title);
    expect(story.businessRequirement.problem).toBe(baseline.businessRequirement.problem);
    expect(story.businessRequirement.stakeholders).toEqual(baseline.businessRequirement.stakeholders);
    expect(story.functionalSpec.userStories).toEqual(baseline.functionalSpec.userStories);
    expect(story.technicalSpec.language).toBe(baseline.technicalSpec.language);
    expect(story.dor.checked).toEqual(baseline.dor.checked);
  });

  it('parses mixed LF/CRLF (copy-paste artefact) identically to LF', () => {
    const story = parseStory(toMixed(storyLF));

    expect(story.metadata.title).toBe(baseline.metadata.title);
    expect(story.businessRequirement.problem).toBe(baseline.businessRequirement.problem);
    expect(story.businessRequirement.stakeholders).toEqual(baseline.businessRequirement.stakeholders);
    expect(story.functionalSpec.userStories).toEqual(baseline.functionalSpec.userStories);
    expect(story.technicalSpec.language).toBe(baseline.technicalSpec.language);
    expect(story.dor.checked).toEqual(baseline.dor.checked);
  });

  it('parses UTF-8 BOM prefix without corrupting the first heading', () => {
    const withBOM = '\ufeff' + storyLF;
    const story = parseStory(withBOM);

    // Metadata regex finds the comment block even with BOM prefix
    expect(story.metadata.id).toBe(baseline.metadata.id);
    expect(story.metadata.title).toBe(baseline.metadata.title);
    // Section fields should still parse (BOM only affects the very first byte,
    // which is before any h2–h4 heading)
    expect(story.businessRequirement.problem).toBe(baseline.businessRequirement.problem);
    expect(story.technicalSpec.language).toBe(baseline.technicalSpec.language);
  });
});

// ---------------------------------------------------------------------------
// parseFix — line ending variants
// ---------------------------------------------------------------------------

describe('parseFix — line ending robustness', () => {
  const baseline = parseFix(fixLF);

  it('parses CRLF (\\r\\n — Windows) identically to LF', () => {
    const fix = parseFix(toCRLF(fixLF));

    expect(fix.metadata.id).toBe(baseline.metadata.id);
    expect(fix.metadata.title).toBe(baseline.metadata.title);
    expect(fix.bugDescription.title).toBe(baseline.bugDescription.title);
    expect(fix.bugDescription.stepsToReproduce).toEqual(baseline.bugDescription.stepsToReproduce);
    expect(fix.impactAssessment.severity).toBe(baseline.impactAssessment.severity);
    expect(fix.regressionPrevention.testsToAdd).toEqual(baseline.regressionPrevention.testsToAdd);
    expect(fix.dof.criteria).toEqual(baseline.dof.criteria);
  });

  it('parses CR-only (\\r — classic Mac) identically to LF', () => {
    const fix = parseFix(toCR(fixLF));

    expect(fix.metadata.id).toBe(baseline.metadata.id);
    expect(fix.metadata.title).toBe(baseline.metadata.title);
    expect(fix.bugDescription.title).toBe(baseline.bugDescription.title);
    expect(fix.bugDescription.stepsToReproduce).toEqual(baseline.bugDescription.stepsToReproduce);
    expect(fix.impactAssessment.severity).toBe(baseline.impactAssessment.severity);
    expect(fix.dof.criteria).toEqual(baseline.dof.criteria);
  });

  it('parses mixed LF/CRLF (copy-paste artefact) identically to LF', () => {
    const fix = parseFix(toMixed(fixLF));

    expect(fix.metadata.title).toBe(baseline.metadata.title);
    expect(fix.bugDescription.title).toBe(baseline.bugDescription.title);
    expect(fix.bugDescription.stepsToReproduce).toEqual(baseline.bugDescription.stepsToReproduce);
    expect(fix.dof.criteria).toEqual(baseline.dof.criteria);
  });
});
