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
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Its entry in `sources.json` names the
set it was taken from and records the attribution the licence requires.

Getting the text is a manual step, because the collection ships `.tar.gz` archives behind a download
form, and shipping an unverifiable unpacker would be worse than one documented instruction:

1. Open <https://wortschatz.uni-leipzig.de/en/download> and download the set.
2. From its archive take `*-sentences.txt`, strip the leading sentence-number column, and save the
   text as `raw/<id>.txt`, one sentence per line.
3. `pnpm corpora <id>`

## Code and Markdown texts

Three texts are not news, since news barely has the symbols, brackets and digits that typing code or
instructions to an AI agent is made of:

| Id | Name | What it is |
|---|---|---|
| `code-c-family` | Code — C family | C, C++, C#, Java, JavaScript and TypeScript, Go, Rust, PHP, Kotlin and Swift: braces and semicolons |
| `code-python-family` | Code — Python family | Python, with a few Nim and GDScript: colons and indentation |
| `en-markdown-agents` | Markdown — AI agents | English Markdown: instructions, rules, prompts and docs of open-source agent projects |

The code texts are tagged `code`, which is not a language and has no profile in
`packages/core/src/lang/profiles.ts`: nothing in them is a letter a keyboard needs beyond ASCII, and
a layout is not "for" them. The Markdown text is English (`en`).

**Where they come from.** `raw/code-sources.json` names every project (about eighty): its repository
at a commit, never a branch, the licence its files are taken under and the file that says so, and
for each text how its bytes are shared (the languages of the C family text, in percent). It is the
single source of truth, and `raw/CODE-SOURCES.md` is its credit file, written from it. Every project
is under MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC or the Unlicense, or CC0 for rules and
prompts; the extractor reads each licence file in the archive, and stops if it is not the licence
the entry says. A project can carry a file of someone else's, so a file that names another licence
in its first lines is left out, and `raw/CODE-SOURCES.md` counts them. The credit is by link to each
project's own licence file at the commit; the notices themselves are not copied into the
repository.

**How they are made.** Three steps, the first on the network:

```bash
pnpm corpora:fetch      # each project's archive, into packages/corpora/.cache (ignored by git)
pnpm corpora:extract    # raw/<id>.txt for each text, and raw/CODE-SOURCES.md
pnpm corpora            # what the app serves, as for every text
```

The archives are read as bytes, never unpacked or run. From each file the extractor takes:

- **Lines without comments.** A small scanner per language family (`packages/core/src/corpus/prepare`)
  takes out comments, and the docstrings of the indentation languages, which is where a project's
  names, addresses and licence headers are. Strings stay, since they are typed. Generated and minified
  files, copies of other projects (`vendor`, `node_modules`, `third_party`) and test fixtures do not.
- **Whitespace as the analysis reads it.** The analysis does not press Enter, Tab, Backspace or
  Escape (AGENTS.md, "A layout is only what the editor can make"), and every run of whitespace in a
  sample is one space, a word boundary. So a line break and the indentation after it become one
  space, and a source line is the unit that is shuffled: the text does not keep what the analysis
  cannot type, and its numbers are of what it types. A line that repeats, `}` or `return;`, is kept as
  often as it comes; a long one that repeats is kept once.
- **Nothing about a person, a secret or a place to find one.** A line is left out whole, never
  rewritten, if it has an e-mail address (or `name [at] host`), a telephone number (digits in groups
  that add to nine or more, or a literal of ten or more: a date or a version stays, `4294967295`
  does not), an IP address, a long hex run, a word of more than 40 characters (a hash, a token, a
  URL) or a mixed run of 24 letters and digits, a key or token in a known form, `password`,
  `secret`, `api_key`, `credential`, `bearer`, `authorization`, the words *copyright*, *author*,
  *licence*, *maintainer*, *contributor*, *thanks*, *et al.* or *written/developed/contributed by*,
  characters outside ASCII (code) or letters outside it (Markdown), or, in code, a capitalised
  pair of words, or `J. Smith`, in quotes, which is what a name in a test looks like. A link is
  left out too unless its site is a project, a standard, a paper or a service everyone uses, or
  made up for examples, and never to a user's page on GitHub, Hugging Face, Docker Hub, npm or
  Google Scholar, or a raw GitHub file; a GitHub or Hugging Face owner must be an organisation on
  a short list. Markdown loses too the lines with a byline, `Name Name's`, a double-barrelled
  name, a profile link or an `@mention`. Then, over the whole text, a line is left out if it has
  a capitalised word the text never writes in lower case and uses in fewer than five lines, or
  two capitalised words side by side that come together in fewer than five lines
  (`packages/core/src/corpus/prepare/names.ts`): `Macron` and `Bill Gates` go, `Claude Code`
  stays. For code that holds for the lines with prose in them, which is what a string or a
  documentation block is. What a word is, as against a name, is told by the lower case words of
  the English news text. A file that says in its first lines it is under another licence (GPL,
  MPL, PSF, Boost, zlib…) is left out whole, and so is a vendored copy of another project
  (`_vendor`, `third_party`, `3rdparty`…). `pnpm test` runs the same judgement over the raw texts
  that ship, and the patterns that need no context over the samples built from them. No filter
  can prove a name is not in a string: that is why comments go whole, why the sources are
  projects' own code and docs, and why the list is strict; a person's name inside an ordinary
  string that no other line repeats can still come through, and the pull request that adds a
  project is where it is looked for.
- **A fixed share, in a fixed order.** Each language gets its share of the bytes, each project of a
  language an equal part of that, and what a short project cannot give goes to the others. Within
  a project the lines come in an order of a hash, so the same archives always give the same text.

`scrub` is off for these texts in `sources.json`: the news scrub is aimed at news and would rewrite
the numeric constants, dates and versions that were typed, so the extractor leaves out the lines
that look like a phone number or an e-mail address instead, as above.

Count them with **Counts** on *Letters, numbers and symbols*, or they are read as identifiers and
words alone.

**Adding a project.** Add its entry to `raw/code-sources.json` with the commit, its SPDX licence
and the licence file, then the three commands above. A project that is not under one of the licences
above does not join; `pnpm test` checks the file.

**Other groups.** `pnpm corpora:fetch research` and `pnpm corpora:research` measure other groups of
languages (shell, SQL, Lisp…) against these texts, from the projects under `research` in the same
file, and write `docs/research/code-groups.json`: nothing of them is kept, only the numbers.
[docs/research/code-corpora.md](../../docs/research/code-corpora.md) is what they say.

## How a sample is built

- **Sentences, in a fixed shuffle.** The raw text is split into lines, one sentence each, and put in
  the order of a hash of each sentence. Leipzig's files are sorted alphabetically, and an analysis
  reads a sample from its start: in file order it would only see the start of the alphabet. Ordered
  by hash, any stretch is a fair draw, and the same raw text always gives the same sample, byte for
  byte, so rebuilding is a no-op and the output is reviewable as a diff.
- **Only Latin letters.** A sentence with a letter of another script is left out: mis-decoded text,
  or a name in Cyrillic or Greek that the language does not write.
  A sentence with punctuation mis-decoded into Latin letters, `â€“` for `–`, is left out too.
- **Contacts scrubbed.** E-mail addresses and phone numbers keep their shape, not their digits.
- **Normalized**, keeping letters, digits **and** symbols. Each analysis narrows that to whatever the
  reader asked for: the default is still letters only, so one sample serves every setting, and
  turning numbers on needs no rebuild. Typographic quotes, dashes and the ellipsis become their
  plain forms, and a language keeps the punctuation its profile names.
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
