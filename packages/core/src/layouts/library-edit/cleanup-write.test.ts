import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { BUNDLED_IDS } from '../bundled-ids.js';
import { movedCommunityFiles } from './cleanup.js';

const DATA = process.env.COMMUNITY_CLEANUP;

/**
 * Not a test: after a deploy, the cleanup of the community files whose layouts are bundled now (see
 * `.github/workflows/ci.yml`, job `community-cleanup`). `COMMUNITY_CLEANUP` is a checkout of the
 * `layerbench-data` branch; the files are deleted there, and listed, for the job to commit.
 *
 *   COMMUNITY_CLEANUP=<checkout> pnpm community-cleanup
 */
describe.skipIf(!DATA)('community cleanup (COMMUNITY_CLEANUP=<checkout>)', () => {
  it('deletes the community files of layouts the Library bundles now', () => {
    const root = DATA as string;
    const listing = readdirSync(join(root, 'community')).map((f) => `community/${f}`);
    const moved = movedCommunityFiles(listing, BUNDLED_IDS);
    for (const path of moved) rmSync(join(root, path));
    console.log(moved.length ? `deleted: ${moved.join(' ')}` : 'nothing to delete');
  });
});
