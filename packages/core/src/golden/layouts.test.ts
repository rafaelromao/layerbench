import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileLayout } from '../layout/compile.js';
import { toCanonicalJson } from '../layout/json.js';
import { safeParseLayout } from '../layout/schema.js';
import { BUNDLED_LAYOUTS } from '../layouts/index.js';
import { goldenPath } from './paths.js';

/**
 * The bundled layouts must serialize to exactly the documents the reference implementation writes.
 * These are the storage, share-link and hashing formats, so any drift breaks interoperability.
 */
describe('bundled layouts — canonical JSON', () => {
  for (const layout of BUNDLED_LAYOUTS) {
    it(`${layout.id} matches the reference document`, () => {
      const expected = JSON.parse(readFileSync(goldenPath(`layouts/${layout.id}.json`), 'utf8'));
      expect(toCanonicalJson(layout)).toEqual(expected);
    });
  }

  it('round-trips through the schema and still compiles', () => {
    for (const layout of BUNDLED_LAYOUTS) {
      const parsed = safeParseLayout(toCanonicalJson(layout));
      expect(parsed.ok, `${layout.id}: ${parsed.ok ? '' : parsed.error}`).toBe(true);
      if (!parsed.ok) continue;
      expect(toCanonicalJson(parsed.layout)).toEqual(toCanonicalJson(layout));
      expect(() => compileLayout(parsed.layout)).not.toThrow();
    }
  });
});
