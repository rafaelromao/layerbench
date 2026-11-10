import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { corpusStream } from '@layerbench/core/corpus';
import { nodeCorpusLoader } from '@layerbench/core/node';
import { LAYOUTS } from './layouts.ts';

/** The text both are given: LayerBench's English news sample. */
export const CORPUS = 'en-general';

/**
 * As many symbols as the app's largest sample, more than the text has (831,614), so the app types
 * all of it, as his page does.
 */
export const SAMPLE = 1_000_000;

/**
 * The letters his corpus popup turns into others (`closeCorpusPopup` in `keyboard_svg.js`): `é`
 * becomes `e` there, while LayerBench, folding case only, cannot type it on these layouts. Each is
 * pasted as {@link MASK}, which he keeps, cannot type either, and counts among the keystrokes as
 * LayerBench counts the `é`: so both type the same keys and skip the same characters.
 */
export const FOLDED = /[äåáàâöóíüéèçæßğ]/g;
export const MASK = '#';

const CORPORA = fileURLToPath(new URL('../../public/corpora', import.meta.url));

export interface PastedText {
  /** What is pasted into his corpus popup. */
  text: string;
  sha256: string;
  /** Distinct words, as his popup splits them: he measures only the first 40,000. */
  words: number;
}

/**
 * The text LayerBench types from the sample, letters only and case folded, as the app's default
 * settings read it, with the letters his popup would change masked. It has no digits, which his
 * popup would drop with the whole word, and no capitals.
 */
export async function pastedText(): Promise<PastedText> {
  for (const { name, layout } of LAYOUTS) {
    if (layout.includes(MASK)) throw new Error(`${name} has a key for ${MASK}, the mask`);
  }
  const corpus = await nodeCorpusLoader(CORPORA).load(CORPUS);
  const text = corpusStream(corpus, 'fold', 'letters').replace(FOLDED, MASK);
  const words = new Set(text.split(' ')).size;
  return { text, sha256: createHash('sha256').update(text).digest('hex'), words };
}
