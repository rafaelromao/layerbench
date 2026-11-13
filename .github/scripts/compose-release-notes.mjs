import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const overviewPath = fileURLToPath(new URL('../../docs/releases/0.3.0.md', import.meta.url));
const overview = readFileSync(overviewPath, 'utf8').trim();
const releaseNotes = process.env.RELEASE_NOTES;

if (!releaseNotes?.trim()) {
  throw new Error('RELEASE_NOTES must contain the generated release notes.');
}

const existingPrefix = `${overview}\n\n`;
const generated = releaseNotes.startsWith(overview)
  ? releaseNotes.slice(overview.length).replace(/^\r?\n\r?\n/, '')
  : releaseNotes;

if (!generated.trim()) {
  throw new Error('The release notes must include generated notes after the overview.');
}

process.stdout.write(`${existingPrefix}${generated}`);
