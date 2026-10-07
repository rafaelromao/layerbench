import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileLayout } from '../layout/compile.js';
import { toCanonicalJson } from '../layout/json.js';
import { safeParseLayout } from '../layout/schema.js';
import { documentedLayouts, goldenLayouts } from '../layouts/index.js';
import { goldenPath } from './paths.js';

/**
 * Every documented layout must serialize to exactly the checked-in document. These are the storage,
 * share-link and hashing formats, so any drift breaks interoperability. `pnpm goldens` rewrites
 * them deliberately; nothing else should change them.
 */
describe('layout documents — canonical JSON', () => {
  for (const layout of goldenLayouts()) {
    it(`${layout.id} matches its checked-in document`, () => {
      const expected = JSON.parse(readFileSync(goldenPath(`layouts/${layout.id}.json`), 'utf8'));
      expect(toCanonicalJson(layout)).toEqual(expected);
    });
  }

  it('round-trips through the schema to the same bytes, and still compiles', () => {
    for (const layout of documentedLayouts()) {
      const parsed = safeParseLayout(toCanonicalJson(layout));
      expect(parsed.ok, `${layout.id}: ${parsed.ok ? '' : parsed.error}`).toBe(true);
      if (!parsed.ok) continue;
      // Bytes, not structure: a link or a stored document must read back as exactly what it was.
      expect(JSON.stringify(toCanonicalJson(parsed.layout)), layout.id).toBe(
        JSON.stringify(toCanonicalJson(layout)),
      );
      expect(() => compileLayout(parsed.layout)).not.toThrow();
    }
  });
});
