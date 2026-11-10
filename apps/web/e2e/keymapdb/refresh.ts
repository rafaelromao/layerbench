/**
 * Downloads the keymapdb keymaps of `entries.ts` at their pinned commits into `.cache/`, which git
 * ignores, and reads each picture drawn by keymap-drawer into `image.json` beside it. A file
 * already there is not fetched again; delete `.cache/` to start over.
 *
 *   node apps/web/e2e/keymapdb/refresh.ts
 *
 * Node 22.18 or later runs it as it is, stripping the types.
 *
 * For each entry, `.cache/<slug>/` holds `keymap.yaml`, `image.<ext>`, `image.json` (pictures by
 * keymap-drawer only) and `board.json` (the keyboard's layout file, where it has one); the files
 * chosen by mistake go in `.cache/mistakes/`.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ENTRIES, entryDir, imageUrl, MISTAKES, mistakePath, yamlUrl } from './entries.ts';
import { readKeymapImage } from './image.ts';

const run = promisify(execFile);

async function fetchTo(url: string, path: string): Promise<string> {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && statSync(path).size > 0) return 'cached';
  const part = `${path}.part`;
  await run('curl', ['-fsSL', '--retry', '3', '--retry-delay', '2', '-o', part, url]);
  renameSync(part, path);
  return `${Math.round(statSync(path).size / 100) / 10} kB`;
}

async function main(): Promise<void> {
  for (const e of ENTRIES) {
    const dir = entryDir(e);
    const lines = [`${e.slug} @ ${e.sha.slice(0, 7)}`];
    lines.push(`keymap ${await fetchTo(yamlUrl(e), join(dir, 'keymap.yaml'))}`);
    const ext = extname(new URL(imageUrl(e)).pathname) || '.svg';
    const image = join(dir, `image${ext}`);
    lines.push(`image ${await fetchTo(imageUrl(e), image)}`);
    if (e.image.sha256) {
      // No commit pins it: say when it is no longer the picture the note was measured on.
      const now = createHash('sha256').update(readFileSync(image)).digest('hex');
      lines.push(now === e.image.sha256 ? 'image as measured' : 'IMAGE CHANGED since measured');
    }
    if (e.image.kind === 'kd-svg') {
      const read = readKeymapImage(readFileSync(image, 'utf8'));
      writeFileSync(join(dir, 'image.json'), `${JSON.stringify(read, null, 1)}\n`);
      lines.push(`layers ${read.layers.map((l) => `${l.name}(${l.keys.length})`).join(' ')}`);
    }
    if (e.board) lines.push(`board ${await fetchTo(e.board.url, join(dir, 'board.json'))}`);
    console.log(lines.join(' · '));
  }
  for (const m of MISTAKES) {
    console.log(`${m.slug}: ${await fetchTo(m.url, mistakePath(m))}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
