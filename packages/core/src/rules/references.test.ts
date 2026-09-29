import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { catalogRules } from './catalog.js';
import { PRESET_IDS } from './presets.js';
import { GLOSSARY_URL, PRESET_REFERENCES, RULE_REFERENCES, ruleReferences } from './references.js';

const catalogIds = catalogRules().map((r) => r.id);

/** GitHub's heading slugs: lower case, punctuation dropped, spaces to hyphens. */
function slugs(markdown: string): Set<string> {
  const out = new Set<string>();
  for (const line of markdown.split('\n')) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (!m) continue;
    out.add(
      m[1]
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s/g, '-'),
    );
  }
  return out;
}

describe('rule references', () => {
  it('cites a source for every rule in the catalog', () => {
    const missing = catalogIds.filter((id) => ruleReferences(id).length === 0);
    expect(missing).toEqual([]);
  });

  it('cites nothing that is not a rule', () => {
    const orphans = Object.keys(RULE_REFERENCES).filter((id) => !catalogIds.includes(id));
    expect(orphans).toEqual([]);
  });

  it('gives every preset a source, and redefines only rules that exist', () => {
    for (const id of PRESET_IDS) {
      const refs = PRESET_REFERENCES[id];
      expect(refs, id).toBeDefined();
      expect(refs.preset.length, id).toBeGreaterThan(0);
      for (const ruleId of Object.keys(refs.rules)) expect(catalogIds).toContain(ruleId);
    }
  });

  it('points only at absolute web addresses', () => {
    const all = [
      ...Object.values(RULE_REFERENCES).flat(),
      ...Object.values(PRESET_REFERENCES).flatMap((p) => [
        ...p.preset,
        ...Object.values(p.rules).flat(),
      ]),
    ];
    for (const ref of all) {
      expect(ref.url, ref.title).toMatch(/^https?:\/\/[^\s]+$/);
      expect(ref.title.trim()).not.toBe('');
    }
  });

  it('puts the definition in force first under a preset that redefines the rule', () => {
    expect(ruleReferences('lsb', 'cyanophage')[0].url).toContain('cyanophage');
    expect(ruleReferences('fsb', 'keysolve')[0].url).toContain('keysolve');
    // A rule the preset leaves alone keeps the catalog's sources only.
    expect(ruleReferences('sfb', 'cyanophage')).toEqual(ruleReferences('sfb'));
  });

  it('links only to headings the glossary actually has', () => {
    const path = fileURLToPath(new URL('../../../../docs/METRICS.md', import.meta.url));
    const headings = slugs(readFileSync(path, 'utf8'));
    const anchors = Object.values(RULE_REFERENCES)
      .flat()
      .filter((r) => r.url.startsWith(GLOSSARY_URL))
      .map((r) => r.url.slice(GLOSSARY_URL.length + 1));
    for (const anchor of new Set(anchors)) expect(headings, anchor).toContain(anchor);
  });
});
