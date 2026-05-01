import { describe, expect, it } from 'vitest';
import { upsertMetadataFields } from '../../../src/workflow/MetadataPatcher';

describe('upsertMetadataFields', () => {
  it('replaces an existing key in place', () => {
    const md = '<!-- metadata\nid: 001\ntitle: Foo\nstatus: open\ngate: 0\n-->\n# Body';
    const { content, changed } = upsertMetadataFields(md, { gate: 4 });
    expect(changed).toBe(true);
    expect(content).toContain('gate: 4');
    expect(content).not.toMatch(/gate:\s*0/);
  });

  it('appends a missing key', () => {
    const md = '<!-- metadata\nid: 001\ntitle: Foo\nstatus: done\n-->';
    const { content, changed } = upsertMetadataFields(md, { gate: 4 });
    expect(changed).toBe(true);
    expect(content).toMatch(/gate:\s*4/);
  });

  it('upserts multiple keys at once', () => {
    const md = '<!-- metadata\nid: 001\nstatus: open\ngate: 2\n-->';
    const { content, changed } = upsertMetadataFields(md, { gate: 4, status: 'done' });
    expect(changed).toBe(true);
    expect(content).toMatch(/gate:\s*4/);
    expect(content).toMatch(/status:\s*done/);
  });

  it('returns changed=false when value already matches', () => {
    const md = '<!-- metadata\nid: 001\ngate: 4\n-->';
    const { changed } = upsertMetadataFields(md, { gate: 4 });
    expect(changed).toBe(false);
  });

  it('throws when metadata block is missing', () => {
    expect(() => upsertMetadataFields('# No metadata here', { gate: 4 })).toThrow(/metadata/i);
  });

  it('preserves keys not targeted by the patch', () => {
    const md = '<!-- metadata\nid: 001\ntitle: Foo Bar\nstatus: done\ngate: 0\n-->';
    const { content } = upsertMetadataFields(md, { gate: 4 });
    expect(content).toContain('id: 001');
    expect(content).toContain('title: Foo Bar');
    expect(content).toContain('status: done');
  });

  it('matches keys case-insensitively but preserves original casing of the key', () => {
    const md = '<!-- metadata\nid: 001\nGate: 0\n-->';
    const { content } = upsertMetadataFields(md, { gate: 4 });
    expect(content).toContain('Gate: 4');
    expect(content).not.toMatch(/Gate:\s*0/);
  });
});
