/**
 * Downloads each repository of `raw/code-sources.json` at its pinned commit into
 * `packages/corpora/.cache/code/<id>.tar.gz`, which git ignores. The archives are only ever read
 * as bytes (`prepare-code.ts`), never unpacked or run. One already there is not fetched again.
 *
 *   pnpm corpora:fetch               # every repository of the corpora
 *   pnpm corpora:fetch tmux fmt      # those ids
 *   pnpm corpora:fetch research      # the repositories of the research note, which no corpus holds
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { promisify } from 'node:util';
import { CACHE_DIR, readCodeSources, tarballPath, tarballUrl } from './code-sources.js';

const run = promisify(execFile);
const PARALLEL = 4;

async function fetchOne(id: string, url: string, path: string): Promise<void> {
  if (existsSync(path) && statSync(path).size > 0) {
    console.log(`${id}: cached`);
    return;
  }
  const part = `${path}.part`;
  await run('curl', ['-fsSL', '--retry', '3', '--retry-delay', '2', '-o', part, url]);
  renameSync(part, path);
  console.log(`${id}: ${Math.round(statSync(path).size / 1000)} kB`);
}

async function main(): Promise<void> {
  const sources = readCodeSources();
  const all = [...sources.repos, ...sources.research.repos];
  const wanted = process.argv.slice(2);
  const unknown = wanted.filter((id) => id !== 'research' && !all.some((r) => r.id === id));
  if (unknown.length > 0) throw new Error(`unknown repository id: ${unknown.join(', ')}`);
  const todo =
    wanted.length === 0
      ? sources.repos
      : all.filter(
          (r) =>
            wanted.includes(r.id) ||
            (wanted.includes('research') && sources.research.repos.includes(r as never)),
        );
  mkdirSync(CACHE_DIR, { recursive: true });

  const failed: string[] = [];
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        try {
          await fetchOne(r.id, tarballUrl(r), tarballPath(r));
        } catch (e) {
          failed.push(r.id);
          console.error(`${r.id}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
        }
      }
    }),
  );
  if (failed.length > 0) {
    console.error(`\nNot fetched: ${failed.join(' ')}. Run it again to fetch just those.`);
    process.exitCode = 1;
  }
}

main();
