# Code and Markdown corpora

Research for `code-c-family`, `code-python-family` and `en-markdown-agents` (`packages/corpora`),
and an answer to which other groups of programming languages deserve a corpus. Everything is
measured with the engine; the data is in [code-groups.json](code-groups.json).

## Method

- **The texts.** Each group is about 300 kB of lines from two to eight open-source projects, read
  exactly as the corpora are (`raw/code-sources.json`, `research`): comments taken out, the same
  line filters, each project an equal part, a fixed order. A group's projects are pinned to a
  commit and their licence file is checked. Nothing of them is committed, only the numbers.
- **Profile.** Over the characters of the text, the share that are symbols (ASCII punctuation),
  digits and capitals, and each symbol's share. The *symbol profile* is each of the 32 symbols and
  10 digits as a share of the symbols and digits together.
- **Distance.** Jensen-Shannon divergence (**JSD**, in bits) between two symbol profiles: 0 for the
  same, 1 for nothing in common.
- **Effect on a layout.** The Effort of the 36 bundled layouts on each text, as the
  Analyze page computes it: the `layouts_doc` rules, 100,000 symbols, no space, letters, numbers and
  symbols counted. **ρ** is the Spearman correlation of two texts' Effort rankings of the layouts,
  with capitals kept (Shift pressed, as the corpora are meant to be read) and, in the last column of
  each table, folded to lower case (the analysis's default).
- **Calibration.** The two new code texts are 0.088 apart (JSD) and rank the layouts
  with ρ = 0.81 (0.88 folded). English news is 0.40 from the
  C family text, with ρ = 0.63. Two questions follow, answered separately: does a group
  **press other keys** (further than 0.15 from every text, since 0.09 is the gap between the two code
  texts), and does it **reorder the layouts** (ρ below 0.85 with every text, since the code texts
  keep 0.81 to 0.88 between them)? Differences in ρ of less than 0.05 are not claimed: the Effort of
  many layouts is close, and the sampling error was not measured.

## What the three texts have that news does not

| text | symbols | digits | capitals | most frequent symbols, % of characters |
|---|---|---|---|---|
| English news | 3.5% | 1.24% | 3.8% | `.` 1.1, `,` 1.1, `'` 0.4, `"` 0.3, `-` 0.3, `(` 0.1 |
| Code — C family | 20.3% | 1.37% | 8.9% | `)` 2.5, `(` 2.5, `,` 1.7, `_` 1.6, `.` 1.5, `;` 1.3 |
| Code — Python family | 20.7% | 1.86% | 4.6% | `"` 3.1, `_` 2.9, `,` 2.1, `)` 2.0, `.` 1.9, `(` 1.9 |
| Markdown — AI agents | 9.1% | 0.59% | 4.2% | `-` 1.5, ``` 1.5, `.` 1.2, `,` 0.8, `*` 0.8, `:` 0.5 |

Symbols are a fifth of the characters of the code texts and 3.5% of the news. Digits are not
what sets code apart in amount (1.37% and 1.86% against 1.24%), but in kind: `0` and `1`
are 51% of the digits of the C family text and 45% of the Python one, against 40% in news.
Markdown is in between: headings, lists, emphasis and inline code, with the fewest digits.

## Do the languages of each group belong together

Each language alone (300 kB of its projects), against the two texts. The text a language is part of
counts it, so its own distance is smaller than it would be; Python is 86% of its text.

| language | its share | symbols | digits | capitals | JSD to C / Py | ρ to C / Py |
|---|---|---|---|---|---|---|
| jsts | 22% | 22.3% | 1.12% | 5.0% | 0.04 / 0.16 | 0.83 / 0.94 |
| java | 14% | 16.1% | 1.37% | 10.4% | 0.06 / 0.17 | 0.95 / 0.82 |
| csharp | 12% | 15.5% | 1.36% | 10.0% | 0.04 / 0.14 | 0.88 / 0.76 |
| c | 12% | 23.0% | 2.11% | 15.7% | 0.10 / 0.17 | 0.95 / 0.87 |
| cpp | 12% | 22.9% | 1.89% | 11.4% | 0.04 / 0.11 | 0.94 / 0.89 |
| go | 8% | 21.7% | 1.40% | 7.2% | 0.07 / 0.09 | 0.91 / 0.90 |
| rust | 8% | 25.9% | 0.77% | 4.5% | 0.03 / 0.10 | 0.87 / 0.96 |
| php | 4% | 21.9% | 0.42% | 6.1% | 0.14 / 0.29 | 0.79 / 0.89 |
| kotlin | 4% | 15.1% | 1.26% | 8.7% | 0.09 / 0.12 | 0.91 / 0.84 |
| swift | 4% | 15.2% | 0.90% | 7.7% | 0.08 / 0.09 | 0.91 / 0.90 |
| python | 86% | 21.0% | 1.82% | 4.2% | 0.09 / 0.00 | 0.84 / 0.99 |
| nim | 7% | 17.2% | 1.87% | 6.8% | 0.11 / 0.06 | 0.90 / 0.94 |
| gdscript | 7% | 18.2% | 2.03% | 7.3% | 0.16 / 0.07 | 0.94 / 0.84 |

- Every C family language is closer to the C family text than to the Python one, but **Go and Swift**
  are about as near to both (0.07 against 0.09, 0.08 against 0.09), and Kotlin is close behind: none
  has a semicolon among its ten most frequent symbols. They stay, since each keeps its braces and
  `{` is 0.8% to 1.4% of their characters, against 0.3% in the Python text.
- **PHP** is the furthest from both (0.14 and 0.29): `$` is 3.4% of its characters, the most
  frequent symbol, and digits are 0.42%. It stays at 4% of the text, as listed.
- **Nim and GDScript** are closer to the Python text (0.06 and 0.07) than to the C family one (0.11
  and 0.16), with a colon at 2.0% and 1.7% of their characters and no brace among their
  top ten symbols. They stay, at 7% each.

## Other groups

Each against the three texts (JSD), with the best ρ any of them gives (and which).

| group | KB | projects | symbols | digits | capitals | most frequent symbols | JSD to C / Py / MD | best ρ, capitals kept | best ρ, folded |
|---|---|---|---|---|---|---|---|---|---|
| Ruby | 300 | 4 | 18.9% | 0.84% | 3.2% | `_` 2.7, `"` 2.4, `.` 1.8, `)` 1.2 | 0.09 / 0.06 / 0.27 | 0.88 (Py) | 0.90 (Py) |
| Lua | 300 | 5 | 19.7% | 0.72% | 1.5% | `.` 2.9, `,` 2.2, `)` 2.0, `(` 1.9 | 0.09 / 0.07 / 0.30 | 0.92 (Py) | 0.92 (Py) |
| Julia | 300 | 3 | 24.0% | 3.89% | 4.8% | `,` 3.5, `)` 3.3, `(` 3.3, `=` 2.9 | 0.09 / 0.08 / 0.34 | 0.91 (Py) | 0.92 (C) |
| ML and functional | 300 | 8 | 17.8% | 1.26% | 7.2% | `.` 1.8, `"` 1.7, `_` 1.7, `)` 1.5 | 0.08 / 0.08 / 0.24 | 0.88 (MD) | 0.96 (MD) |
| Lisp | 300 | 4 | 22.3% | 1.90% | 1.8% | `)` 6.5, `(` 6.4, `-` 4.1, `"` 0.9 | 0.28 / 0.33 / 0.37 | 0.88 (Py) | 0.93 (C) |
| Shell | 300 | 7 | 23.2% | 1.90% | 11.9% | `"` 4.1, `_` 3.1, `-` 2.2, `$` 1.7 | 0.18 / 0.18 / 0.33 | 0.91 (C) | 0.91 (C) |
| PowerShell | 300 | 4 | 17.6% | 0.92% | 10.5% | `$` 2.8, `-` 2.4, `"` 1.4, `'` 1.4 | 0.20 / 0.26 / 0.32 | 0.90 (Py) | 0.92 (MD) |
| SQL | 300 | 2 | 15.2% | 1.63% | 31.9% | `,` 2.1, `_` 2.1, `.` 1.3, `)` 1.3 | 0.13 / 0.12 / 0.36 | 0.71 (C) | 0.92 (MD) |
| CSS | 300 | 4 | 22.9% | 3.72% | 0.3% | `-` 5.7, `:` 3.2, `;` 2.4, `}` 1.8 | 0.22 / 0.30 / 0.27 | 0.72 (MD) | 0.84 (C) |
| JSON | 300 | 2 | 30.1% | 1.28% | 2.7% | `"` 13.6, `:` 4.7, `,` 3.7, `}` 2.4 | 0.39 / 0.31 / 0.49 | 0.78 (C) | 0.81 (C) |
| YAML | 170 | 3 | 14.9% | 2.21% | 6.7% | `:` 6.7, `-` 2.7, `_` 1.0, `.` 0.8 | 0.38 / 0.33 / 0.34 | 0.85 (C) | 0.88 (C) |
| HTML and XML | 300 | 4 | 21.1% | 1.43% | 2.3% | `>` 6.7, `<` 6.7, `/` 3.6, `"` 1.1 | 0.55 / 0.58 / 0.58 | 0.84 (Py) | 0.94 (C) |
| LaTeX | 203 | 2 | 15.7% | 6.89% | 1.8% | `\` 7.1, `}` 1.9, `{` 1.9, `=` 0.7 | 0.48 / 0.54 / 0.58 | 0.92 (MD) | 0.93 (MD) |

Read against the calibration above:

- **They would repeat what is there:** Ruby, Lua and Julia (0.06 to 0.08 from the Python text, best ρ
  of 0.88 to 0.92), and the ML family, Haskell, OCaml, F# and Elm (0.08 from either code text).
  Ruby, Lua and Julia end blocks with `end` where Python has a colon, but what they press is close
  to what Python does.
- **They press other keys, and rank the layouts as a text does already:** Lisp (parentheses are
  12.8% of its characters, 58% of its symbols), Shell (`$`, quotes, `-` flags), PowerShell and
  LaTeX (`\` is 7.1% of its characters; it ranks the layouts like the Markdown text, ρ 0.92). They
  would change a heat map and what a layout is missing, hardly the order of the layouts.
- **They would reorder the layouts in both case modes:** JSON (13.6% of its characters are quotes;
  best ρ 0.78, 0.81 folded), and CSS (`-`, `:` and `;`), clearly with capitals kept (0.72) and on
  the line folded (0.84).
- **They would reorder them only with capitals kept:** SQL, whose capitals are 32% of its
  characters, against 4% to 9% in the three texts (best ρ 0.71 with them, 0.92 folded), and
  HTML with XML (`<`, `>` and `/` are 17% of its characters; 0.84, 0.94 folded; the
  furthest profile of all with LaTeX, 0.48 or more from every text). YAML is on the line (0.85,
  0.88) and 0.33 or more from every text.
- **Array languages** were not measured: APL and BQN are written with glyphs outside ASCII that no
  bundled layout types, so every one would be skipped, and J and K were not looked for.

The projects each group was read from:

- **Ruby**: sinatra, rake, rspec-core, jekyll.
- **Lua**: luarocks, busted, nvim-lspconfig, lazy-nvim, telescope-nvim.
- **Julia**: flux, dataframes, julia.
- **ML and functional**: cabal, postgrest, stack, dune, lwt, base, paket, elm-core.
- **Lisp**: paip-lisp, chibi-scheme, quilc, kons-9.
- **Shell**: nvm, ohmyzsh, bats-core, pyenv, rbenv, asdf, bash-it.
- **PowerShell**: pester, posh-git, psreadline, powershell.
- **SQL**: sql-server-samples, hasura.
- **CSS**: normalize-css, bootstrap-css, pico, github-markdown-css.
- **JSON**: json-schema-test-suite, schemastore.
- **YAML**: starter-workflows, kubernetes-examples, awesome-compose.
- **HTML and XML**: html5-boilerplate, bootstrap-html, spring-petclinic, maven.
- **LaTeX**: tectonic, latex-workshop.

## Recommendation

Add next, in this order, each as its own corpus if the owner agrees:

1. **Data: JSON and YAML.** Configuration, manifests and agent settings, typed all day when working
   with agents. JSON reorders the layouts in both case modes (best ρ 0.78 and 0.81), YAML is
   on the line (0.85 and 0.88) and 0.33 or more from every text, and a text of both averages two
   different profiles (quotes and colons, against colons and dashes).
2. **Web: CSS, HTML and XML.** CSS reorders the layouts clearly with capitals kept (0.72) and is
   on the line folded (0.84); HTML's profile is among the furthest (0.55 or more from every
   text), with the layouts reordered when capitals are kept. They are two shapes (`<>/` and
   `-:;`), so a text of both averages them.
3. **SQL**, if capitals are counted; with the default fold it only repeats a corpus.

Shell is optional: its symbols are far from the texts (`$` and quotes) but it ranks the layouts as the
C family text does, so it is worth a corpus for the heat map, not for the ranking. Leave out the ML
family, Ruby, Lua, Julia, Lisp and LaTeX unless someone types them: they repeat a corpus or rank the
layouts as one does.

Caveats: a group of two or three projects (JSON, SQL, LaTeX, YAML) is an estimate of a language,
and the JSON test suite is data written for tests. YAML at 170 kB and LaTeX at 203 kB are under the 300 kB the others have,
because the projects had no more lines left after the filters. The samples are 300 kB where the
corpora are a megabyte. The ranking is of the bundled layouts' Effort under the `layouts_doc` rules;
SFB and the other rules were not ranked.

## Reproducing

```bash
pnpm corpora:fetch research   # the projects of the groups, once (network)
pnpm corpora:research         # writes docs/research/code-groups.json
```
