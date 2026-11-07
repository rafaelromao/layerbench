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
- **Calibration.** The two new code texts are 0.086 apart (JSD) and rank the layouts
  with ρ = 0.81 (0.87 folded). English news is 0.39 from the
  C family text, with ρ = 0.62. Two questions follow, answered separately: does a group
  **press other keys** (further than 0.15 from every text, since 0.09 is the gap between the two code
  texts), and does it **reorder the layouts** (ρ below 0.85 with every text, since the code texts
  keep 0.81 to 0.87 between them)? Differences in ρ of less than 0.05 are not claimed: the Effort of
  many layouts is close, and the sampling error was not measured.

## What the three texts have that news does not

| text | symbols | digits | capitals | most frequent symbols, % of characters |
|---|---|---|---|---|
| English news | 3.5% | 1.24% | 3.8% | `.` 1.1, `,` 1.1, `'` 0.4, `"` 0.3, `-` 0.3, `(` 0.1 |
| Code — C family | 20.0% | 1.31% | 9.0% | `)` 2.5, `(` 2.5, `.` 1.6, `,` 1.6, `_` 1.6, `;` 1.2 |
| Code — Python family | 20.4% | 1.68% | 4.8% | `_` 3.1, `"` 2.9, `.` 2.0, `)` 2.0, `,` 1.9, `(` 1.9 |
| Markdown — AI agents | 9.5% | 0.79% | 4.5% | `-` 1.6, ``` 1.4, `.` 1.2, `*` 0.8, `,` 0.7, `:` 0.5 |

Symbols are a fifth of the characters of the code texts and 3.5% of the news. Digits are not what sets
code apart in amount (1.31% and 1.68% against 1.24%), but in kind: `0`
and `1` are 52% of the digits of the C family text and 44% of the Python one, against 40% in news.
Markdown is in between: headings, lists, emphasis and inline code, with the fewest digits.

## Do the languages of each group belong together

Each language alone (300 kB of its projects), against the two texts. The text a language is part of
counts it, so its own distance is smaller than it would be; Python is 86% of its text.

| language | its share | symbols | digits | capitals | JSD to C / Py | ρ to C / Py |
|---|---|---|---|---|---|---|
| jsts | 22% | 22.1% | 1.16% | 5.1% | 0.05 / 0.16 | 0.81 / 0.94 |
| java | 14% | 15.5% | 1.29% | 10.8% | 0.06 / 0.16 | 0.92 / 0.81 |
| csharp | 12% | 14.9% | 1.16% | 10.2% | 0.05 / 0.14 | 0.83 / 0.73 |
| c | 12% | 22.8% | 2.16% | 15.6% | 0.10 / 0.17 | 0.95 / 0.87 |
| cpp | 12% | 22.8% | 1.93% | 11.5% | 0.04 / 0.11 | 0.93 / 0.88 |
| go | 8% | 21.4% | 1.34% | 7.4% | 0.07 / 0.09 | 0.91 / 0.89 |
| rust | 8% | 25.7% | 0.82% | 4.5% | 0.03 / 0.09 | 0.85 / 0.96 |
| php | 4% | 21.5% | 0.36% | 6.2% | 0.15 / 0.29 | 0.79 / 0.88 |
| kotlin | 4% | 14.7% | 1.23% | 9.0% | 0.08 / 0.12 | 0.88 / 0.82 |
| swift | 4% | 15.0% | 0.98% | 8.1% | 0.08 / 0.09 | 0.87 / 0.88 |
| python | 86% | 20.7% | 1.71% | 4.3% | 0.09 / 0.00 | 0.83 / 0.99 |
| nim | 7% | 17.1% | 1.81% | 6.8% | 0.11 / 0.07 | 0.89 / 0.94 |
| gdscript | 7% | 18.1% | 1.80% | 7.4% | 0.16 / 0.07 | 0.94 / 0.83 |

- Every C family language is closer to the C family text than to the Python one, but **Go and Swift**
  are about as near to both (0.07 against 0.09, 0.08 against 0.09), and Kotlin is close behind: none
  has a semicolon among its ten most frequent symbols. They stay, since each keeps its braces and
  `{` is 0.8% to 1.3% of their characters, against 0.3% in the Python text.
- **PHP** is the furthest from both (0.15 and 0.29): `$` is 3.3% of its characters, the most
  frequent symbol, and digits are 0.36%. It stays at 4% of the text, as listed.
- **Nim and GDScript** are closer to the Python text (0.07 for both) than to the C family one (0.11
  and 0.16), with a colon at 2.0% and 1.5% of their characters and no brace among their top ten
  symbols. They stay, at 7% each.

## Other groups

Each against the three texts (JSD), with the best ρ any of them gives (and which).

| group | projects | symbols | digits | capitals | most frequent symbols | JSD to C / Py / MD | best ρ, capitals kept | best ρ, folded |
|---|---|---|---|---|---|---|---|---|
| Ruby | 4 | 18.9% | 0.81% | 3.3% | `_` 2.8, `"` 2.3, `.` 1.9, `)` 1.2 | 0.08 / 0.05 / 0.28 | 0.88 (Py) | 0.90 (Py) |
| Lua | 5 | 19.8% | 0.72% | 1.5% | `.` 3.0, `,` 2.1, `)` 2.0, `_` 2.0 | 0.09 / 0.07 / 0.30 | 0.92 (Py) | 0.92 (Py) |
| Julia | 3 | 23.8% | 3.65% | 4.9% | `,` 3.5, `(` 3.3, `)` 3.3, `=` 2.8 | 0.09 / 0.08 / 0.33 | 0.90 (Py) | 0.91 (C) |
| ML and functional | 8 | 17.9% | 1.25% | 7.2% | `.` 1.8, `"` 1.8, `_` 1.7, `)` 1.4 | 0.08 / 0.08 / 0.24 | 0.86 (MD) | 0.96 (MD) |
| Lisp | 4 | 22.2% | 1.86% | 1.8% | `)` 6.4, `(` 6.3, `-` 4.1, `"` 0.9 | 0.28 / 0.33 / 0.36 | 0.87 (Py) | 0.90 (C) |
| Shell | 7 | 23.1% | 1.88% | 12.7% | `"` 4.0, `_` 3.5, `-` 2.2, `$` 1.8 | 0.18 / 0.18 / 0.32 | 0.91 (C) | 0.89 (C) |
| PowerShell | 4 | 17.6% | 0.96% | 10.7% | `$` 2.8, `-` 2.2, `"` 1.4, `.` 1.3 | 0.19 / 0.24 / 0.31 | 0.91 (Py) | 0.94 (MD) |
| SQL | 2 | 15.4% | 1.85% | 30.8% | `_` 2.2, `,` 2.2, `.` 1.3, `)` 1.3 | 0.13 / 0.12 / 0.35 | 0.70 (C) | 0.92 (MD) |
| CSS | 4 | 22.8% | 3.45% | 0.3% | `-` 6.0, `:` 3.1, `;` 2.2, `}` 1.6 | 0.23 / 0.30 / 0.26 | 0.73 (MD) | 0.84 (C) |
| JSON | 2 | 29.9% | 1.27% | 2.6% | `"` 13.5, `:` 4.7, `,` 3.7, `}` 2.3 | 0.39 / 0.32 / 0.49 | 0.78 (C) | 0.81 (C) |
| YAML | 3 | 15.0% | 2.18% | 6.9% | `:` 6.5, `-` 2.7, `_` 1.0, `.` 0.9 | 0.37 / 0.33 / 0.33 | 0.84 (C) | 0.86 (C) |
| HTML and XML | 4 | 20.8% | 1.61% | 2.6% | `>` 6.0, `<` 6.0, `/` 3.4, `"` 1.2 | 0.50 / 0.53 / 0.50 | 0.82 (Py) | 0.93 (C) |
| LaTeX | 2 | 16.6% | 6.40% | 1.8% | `\` 7.6, `}` 2.0, `{` 2.0, `@` 0.8 | 0.49 / 0.56 / 0.57 | 0.91 (MD) | 0.92 (MD) |

Read against the calibration above:

- **They would repeat what is there:** Ruby, Lua and Julia (0.05 to 0.08 from the Python text, best ρ
  of 0.88 to 0.92), and the ML family, Haskell, OCaml, F# and Elm (0.08 from either code text). Ruby, Lua
  and Julia end blocks with `end` where Python has a colon, but what they press is close to what
  Python does.
- **They press other keys, and rank the layouts as a text does already:** Lisp (parentheses are
  12.8% of its characters, 57% of its symbols), Shell (`$`, quotes, `-` flags), PowerShell and
  LaTeX (`\` is 7.6% of its characters; it ranks the layouts like the Markdown text). They would
  change a heat map and what a layout is missing, hardly the order of the layouts.
- **They would reorder the layouts in both case modes:** JSON (13.5% of its characters are quotes;
  best ρ 0.78, 0.81 folded) and CSS (`-`, `:` and `;`; 0.73, 0.84
  folded).
- **They would reorder them only with capitals kept:** SQL, whose capitals are 31% of its characters,
  against 5% to 9% in the three texts (best ρ 0.70 with them, 0.92 folded), and HTML
  with XML (`<`, `>` and `/` are 15% of its characters; 0.82, 0.93
  folded). YAML is on the line (0.84, 0.86) and 0.33 or more from every text.
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
   on the line (0.84 and 0.86) and 0.33 or more from every text, and a text of both averages two
   different profiles (quotes and colons, against colons and dashes).
2. **Web: CSS, HTML and XML.** CSS reorders the layouts in both case modes (0.73 and 0.84) and
   HTML is the furthest profile of all (0.50 from every text), with the layouts reordered when
   capitals are kept. They are two shapes (`<>/` and `-:;`), so a text of both averages them.
3. **SQL**, if capitals are counted; with the default fold it only repeats a corpus.

Shell is optional: its symbols are far from the texts (`$` and quotes) but it ranks the layouts as the
C family text does, so it is worth a corpus for the heat map, not for the ranking. Leave out the ML
family, Ruby, Lua, Julia, Lisp and LaTeX unless someone types them: they repeat a corpus or rank the
layouts as one does.

Caveats: a group of two or three projects (JSON, SQL, LaTeX, YAML at 177 kB) is an estimate of a
language, and the JSON test suite is data written for tests. The samples are 300 kB where the corpora
are a megabyte. The ranking is of the bundled layouts' Effort under the `layouts_doc` rules; SFB
and the other rules were not ranked.

## Reproducing

```bash
pnpm corpora:fetch research   # the projects of the groups, once (network)
pnpm corpora:research         # writes docs/research/code-groups.json
```
