# Corpora

`raw/sources.json` is the single source of truth. Each entry names a file in `raw/`, the language it
is in, its licence, where it came from, and whether the text was generated. `pnpm corpora` normalises
each one, caps it at a megabyte on a sentence boundary, and writes what the web app serves:
`apps/web/public/corpora/<id>/{sample.txt,manifest.json}` plus an `index.json` the browser's picker
reads.

A corpus whose raw file is missing is skipped with a note rather than failing the build, so the
repository can list corpora whose text you have not downloaded yet.

## Commands

```bash
pnpm corpora              # build every corpus whose raw text is present
pnpm corpora en-conv      # build one
pnpm corpora:fetch        # download the word-frequency lists (needs network)
pnpm corpora:generate     # build conversational text from those lists
```

The samples keep letters, digits **and** symbols. Each analysis narrows that to whatever the reader
asked for — the default is still letters only, so one sample serves every setting and turning
numbers on does not need a rebuild.

## Provisioning the corpora

Two corpora per language: conversation, generated from word frequencies, and news, sampled from
the Leipzig collection. English, Brazilian Portuguese, Spanish and French ship their conversational
corpora; English and Portuguese ship news, and Spanish and French news wait for the manual step
below. Italian is listed and has neither yet.

### Conversational — `en-conv`, `pt-br-conv`, `es-conv`, `fr-conv`, `it-conv`

Generated, and fully automated:

```bash
pnpm corpora:fetch en pt_br es fr it
pnpm corpora:generate en pt_br es fr it
pnpm corpora
```

`corpora:fetch` downloads word-frequency lists from
[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), which counts words across
the OpenSubtitles corpus — conversational register, accents intact. Its code is MIT, but the lists
are [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), so the corpora generated from
them are shared under it too, as `sources.json` records. `corpora:generate` samples those words in
proportion to their frequency and shapes them into capitalised, punctuated sentences.

They draw from the 8,000 most frequent usable words of each language. `pt_br` is counted over Brazilian
subtitles only.

The lists count words as a tokenizer split them, and the generator puts them back together:

- English clitics go back on a word they follow — `I'm`, `don't`, `you're`, `it's` — and one drawn
  after a word that cannot take it is written on a likely one instead, so each is written about as
  often as it was counted. Stems like `didn` only ever appear with their `'t`.
- French elisions (`c'`, `l'`, `j'`, `qu'`…) join the next word starting with a vowel or an h.
- Single letters that are not words of the language, and words with letters it does not use — a
  foreign name, the `º` of an ordinal — are left out. The alphabet is the language profile's.

The generator is deterministic — the same list yields the same text byte for byte — so rebuilding is
a no-op and the output is reviewable as a diff.

### News — `es-general`, `fr-general`, `it-general`

A manual step, because the Leipzig Corpora Collection ships `.tar.gz` archives behind a download
form and shipping an unverifiable unpacker would be worse than one documented instruction.

1. Open <https://wortschatz.uni-leipzig.de/en/download> and download the 30K sentence sets:
   `spa_news_2023_30K`, `fra_news_2023_30K`, `ita_news_2023_30K`.
2. From each archive take `*-sentences.txt`, strip the leading sentence-number column, and save the
   text as `raw/es-general.txt`, `raw/fr-general.txt`, `raw/it-general.txt`.
3. `pnpm corpora`

`en-general` and `pt-br-general` were produced the same way, from `eng_news_2023_30K` and
`por-br_newscrawl_2011_30K`. The collection is CC BY 4.0;
`sources.json` records the attribution the licence requires.

## Adding a text

A text joins the ones the app serves by pull request: its raw file here, its entry in
`sources.json` with an open licence and a linked source, and what `pnpm corpora` builds from them.
The repository's README, under [Bundled corpora](../../README.md#bundled-corpora), lists each step;
the `corpora` workflow checks the pull request.

## Adding a language

1. A `LanguageProfile` in `packages/core/src/lang/profiles.ts` — the characters the language cannot
   be written without, and any punctuation of its own. This is what makes the app able to say "this
   layout cannot type 4 characters Spanish needs" instead of silently fragmenting the n-grams at
   every one of them.
2. Entries in `raw/sources.json`.
3. The raw text, by either route above.
4. `pnpm corpora`.

## Two things worth knowing

- The picker groups corpora by language, and `index.json` is rewritten on every run — a partial
  build used to leave it describing corpora that had since changed.
- `built_at` is preserved when a sample has not moved, so a rebuild does not dirty every file.
