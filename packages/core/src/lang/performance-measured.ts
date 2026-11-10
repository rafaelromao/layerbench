import { expect, it } from 'vitest';
import { BUNDLED_LAYOUTS } from '../layouts/index.js';
import { measureLanguage } from './measure.js';

/**
 * Every bundled layout that types `tag` and is in the better half by Effort declares it, and no
 * other does. One file a language calls this (`performance-<tag>.test.ts`), so they run apart.
 */
export function declaresPerformance(tag: string): void {
  // An analysis of every bundled layout, about three times slower under coverage on a CI runner.
  it(`for ${tag}: the layouts that type it and are in the better half by Effort`, {
    timeout: 180_000,
  }, async () => {
    const measured = await measureLanguage(tag);
    const declared = BUNDLED_LAYOUTS.filter((l) => l.languages?.includes(tag)).map((l) => l.id);
    expect(declared, 'run `pnpm languages`').toEqual(
      BUNDLED_LAYOUTS.filter((l) => measured.has(l.id as string)).map((l) => l.id),
    );
  });
}
