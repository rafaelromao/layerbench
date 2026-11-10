import { describe, expect, it } from 'vitest';
import { bundledEfforts, measureEfforts } from './measure.js';
import { BUNDLED_EFFORTS, performsWell } from './performance.js';

/**
 * The bundled layouts' Efforts on `tag` are what the engine measures, and put each layout where
 * counting the others puts it. One file a language calls this (`performance-<tag>.test.ts`), so the
 * languages run apart.
 */
export function measuresEfforts(tag: string): void {
  describe('the bundled layouts’ Efforts on each language', () => {
    // An analysis of every bundled layout, about three times slower under coverage on a CI runner.
    it(`for ${tag}: are what the engine measures`, { timeout: 180_000 }, async () => {
      expect(await measureEfforts(tag), 'run `pnpm languages`').toEqual(BUNDLED_EFFORTS[tag]);
    });

    it(`for ${tag}: put each bundled layout where counting the others puts it`, {
      timeout: 180_000,
    }, async () => {
      const measured = await bundledEfforts(tag);
      for (const [id, effort] of measured) {
        // The rule on the unrounded Efforts of the others, with this layout counted among them.
        const better = [...measured.values()].filter((other) => other < effort).length;
        expect(performsWell(effort, BUNDLED_EFFORTS[tag]), `${id} ${tag}`).toBe(
          better * 2 < measured.size,
        );
      }
    });
  });
}
