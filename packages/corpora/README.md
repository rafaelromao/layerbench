# Corpora

`raw/sources.json` is the single source of truth. Each entry names a file in `raw/`, the language it
is in, its licence and where it came from. `pnpm corpora` builds what the web app serves from each:
`apps/web/public/corpora/<id>/{sample.txt,manifest.json}`, plus an `index.json` the browser's picker
reads.

A corpus whose raw file is missing is skipped with a note rather than failing the build, so the
repository can list corpora whose text you have not downloaded yet.

## Commands

```bash
pnpm corpora               # build every corpus whose raw text is present
pnpm corpora en-general    # build one
```

## One corpus per language

Each language has one text: news sentences from the
[Leipzig Corpora Collection](https://wortschatz.uni-leipzig.de/en/download), which is
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); `sources.json` records the attribution
the licence requires.

| id | Language | Leipzig set |
|---|---|---|
| `en-general` | English | `eng_news_2023_30K` |
| `pt-br-general` | Brazilian Portuguese | `por-br_newscrawl_2011_30K` |
| `es-general` | Spanish | `spa_news_2023_30K` |
| `fr-general` | French | `fra_news_2023_30K` |
| `it-general` | Italian | `ita_news_2023_30K` |

Getting the text is a manual step, because the collection ships `.tar.gz` archives behind a download
form, and shipping an unverifiable unpacker would be worse than one documented instruction:

1. Open <https://wortschatz.uni-leipzig.de/en/download> and download the set.
2. From its archive take `*-sentences.txt`, strip the leading sentence-number column, and save the
   text as `raw/<id>.txt`, one sentence per line.
3. `pnpm corpora <id>`

## How a sample is built

- **Sentences, in a fixed shuffle.** The raw text is split into lines, one sentence each, and put in
  the order of a hash of each sentence. Leipzig's files are sorted alphabetically, and an analysis
  reads a sample from its start: in file order it would only see sentences from `$` to `B`. Ordered
  by hash, any stretch is a fair draw, and the same raw text always gives the same sample, byte for
  byte, so rebuilding is a no-op and the output is reviewable as a diff.
- **Only Latin letters.** A sentence with a letter of another script is left out: mis-decoded text,
  or a name in Cyrillic or Greek that the language does not write.
- **Contacts scrubbed.** E-mail addresses and phone numbers keep their shape, not their digits.
- **Normalized**, keeping letters, digits **and** symbols. Each analysis narrows that to whatever the
  reader asked for: the default is still letters only, so one sample serves every setting, and
  turning numbers on needs no rebuild. Typographic quotes, dashes and the ellipsis become `' " - .`.
  French keeps `« »`, and Spanish `¿ ¡`.
- **Capped** at a megabyte of whole sentences.

## Adding a text

A text joins the ones the app serves by pull request: its raw file here, its entry in
`sources.json` with an open licence and a linked source, and what `pnpm corpora` builds from them.
The repository's README, under [Bundled corpora](../../README.md#bundled-corpora), lists each step;
the `corpora` workflow checks the pull request.

## Adding a language

1. A `LanguageProfile` in `packages/core/src/lang/profiles.ts`: the characters the language cannot
   be written without, and any punctuation of its own. This is what makes the app able to say "this
   layout cannot type 4 characters Spanish needs" instead of silently fragmenting the n-grams at
   every one of them.
2. Its entry in `raw/sources.json`.
3. The raw text, as above.
4. `pnpm corpora`.

## Two things worth knowing

- The picker groups corpora by language, and `index.json` is rewritten on every run — a partial
  build used to leave it describing corpora that had since changed.
- `built_at` is preserved when a sample has not moved, so a rebuild does not dirty every file.
