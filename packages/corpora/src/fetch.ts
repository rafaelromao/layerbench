/**
 * Downloads the word-frequency lists the conversational corpora are generated from.
 *
 *   pnpm corpora:fetch                 # every language listed below
 *   pnpm corpora:fetch en pt_br es fr  # just these
 *
 * Lists come from hermitdave/FrequencyWords, which counts words across the OpenSubtitles corpus —
 * conversational register, with accents intact. Its code is MIT, but the lists are CC BY-SA 4.0,
 * and so are the corpora generated from them. They are plain text, one `word count` per line, so
 * nothing here has to unpack an archive.
 *
 * The larger news corpora are a manual step; `packages/corpora/README.md` has the URLs and why.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FREQ_DIR = join(here, '..', 'raw', 'freq');

const YEAR = '2018';
/** The list's directory name. `pt_br` is counted over Brazilian subtitles only; `pt` mixes both. */
const LANGS: Record<string, string> = {
  es: 'es',
  fr: 'fr',
  it: 'it',
  pt: 'pt',
  pt_br: 'pt_br',
  en: 'en',
};

function url(lang: string): string {
  return `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/${YEAR}/${lang}/${lang}_50k.txt`;
}

async function fetchList(lang: string): Promise<void> {
  const from = url(lang);
  const res = await fetch(from);
  if (!res.ok) throw new Error(`${from}: HTTP ${res.status}`);
  const body = await res.text();
  const lines = body.split('\n').filter((l) => l.trim().length > 0).length;
  if (lines < 1000) throw new Error(`${from}: only ${lines} lines, expected a 50k list`);

  const header = [
    `# ${lang} word frequencies, OpenSubtitles ${YEAR}`,
    '# Source: hermitdave/FrequencyWords (lists CC BY-SA 4.0)',
    `# ${from}`,
    `# Retrieved: ${new Date().toISOString().slice(0, 10)}`,
    '',
  ].join('\n');
  mkdirSync(FREQ_DIR, { recursive: true });
  const path = join(FREQ_DIR, `${lang}-${YEAR}.txt`);
  writeFileSync(path, header + body);
  console.log(`${lang}: ${lines} words -> raw/freq/${lang}-${YEAR}.txt`);
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const langs = requested.length > 0 ? requested : Object.keys(LANGS);
  for (const lang of langs) {
    if (!LANGS[lang]) throw new Error(`unknown language: ${lang}`);
    await fetchList(lang);
  }
  console.log('\nNow run `pnpm corpora:generate` to build the text, then `pnpm corpora`.');
}

await main();
