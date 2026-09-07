import { readFileSync } from 'node:fs';
import { fixturePath } from '../golden/paths.js';

/**
 * Fixture corpora, ~10 kB each, sampled from rafaelromao/romak (MIT). Test-only: this module reads
 * from disk, so it is not part of the browser entry point.
 */
export const FIXTURE_EN: string = readFileSync(fixturePath('fixture_en.txt'), 'utf8').trim();
export const FIXTURE_PT: string = readFileSync(fixturePath('fixture_pt.txt'), 'utf8').trim();
export const FIXTURE_MIXED: string = `${FIXTURE_EN} ${FIXTURE_PT}`;
