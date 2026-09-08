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
pnpm corpora en-work      # build one
pnpm corpora:fetch        # download the word-frequency lists (needs network)
pnpm corpora:generate     # build conversational text from those lists
```

The samples keep letters, digits **and** symbols. Each analysis narrows that to whatever the reader
asked for — the default is still letters only, so one sample serves every setting and turning
numbers on does not need a rebuild.

## Provisioning the Spanish, French and Italian corpora

Two corpora per language, matching the split the English and Portuguese ones use.

### Conversational — `es-conv`, `fr-conv`, `it-conv`

Generated, and fully automated:

```bash
pnpm corpora:fetch es fr it
pnpm corpora:generate es fr it
pnpm corpora
```

`corpora:fetch` downloads word-frequency lists from
[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) (MIT), which counts words
across the OpenSubtitles corpus — conversational register, accents intact. `corpora:generate` samples
those words in proportion to their frequency and shapes them into capitalised, punctuated sentences.

This is the same method the existing `en-work` and `pt-br-work` corpora were built with, with one
improvement: those two are shuffled word bags, so no sentence in them ever starts with a capital.
Any analysis of shift or sentence-case modelling against them measures that artifact rather than the
layout. The generated corpora have real sentence boundaries, so they do not.

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

That is exactly how `en-general` and `pt-br-general` were produced. The collection is CC BY 4.0;
`sources.json` records the attribution the licence requires.

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
