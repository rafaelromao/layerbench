# The cyanophage-like rules held to cyanophage's playground

The cyanophage-like rule set (`cyanophage()` in `packages/core/src/rules/presets.ts`) is meant to
count what [cyanophage's playground](https://cyanophage.github.io/playground.html) counts. The e2e
`apps/web/e2e/cyanophage.spec.ts` checks that it does: ten layouts, each built in LayerBench from the
same string his index links it with, typed on the same text, must read what his page prints, to the
two decimals it prints, or the test fails. His numbers are pinned in
`apps/web/e2e/cyanophage/fixture.json`, read from his page on 2026-11-10; the e2e compares offline.
`packages/core/src/rules/cyanophage-playground.test.ts` holds the engine to the same fixture without
a browser, so CI catches a change to the rules that would move a number.

## What is compared

| His page prints | LayerBench rule | Panel and view |
|---|---|---|
| Effort | `effort` | under the board |
| Same Finger Bigrams | `sfb` | SFB panel, first view |
| 2u Same Finger Bigrams | `sfb_2u` | SFB panel, third view |
| Lat Stretch Bigrams | `lsb` | LSB panel, first view |
| Skip Bigrams | `sfs` | skipgram panel, first view |
| Scissors | `fsb` | scissors panel, first view |
| weak redirect | `weak_redirect` | trigram panel, first view |

His **redirects** are not compared. He prints redirects with an index finger and weak redirects
(without one) as two shares of his trigrams, and the rule set's `redirect` is both together: two
numbers each rounded to two decimals cannot be held to their sum at two decimals. His weak redirects
are compared: the rule set's `weak_redirect` is his, three different fingers and no index. His other views
(Ring LSBs, Pinky/Ring Scissors, Rowskips, Skip Bigrams 2u) have no rule of their own here.

The layouts are Qwerty, Dvorak, Colemak, Colemak-DH, Graphite, Gallium, APTv3, Sturdy, Recurva and
Focal, as his index writes them (`apps/web/e2e/cyanophage/layouts.ts`). LayerBench reads each string
through the Library's **Import** onto the ANSI row-stagger board, whose right outer keys take the
eleventh character of the top and home rows, as his board does. His `^` is a thumb that only
shifts; layouts with a letter on a thumb are left out, because a thumb press costs 1 in LayerBench's
Effort and nothing in his. LayerBench's own bundled layouts are not the comparison: they are thirty
keys and their authors' thumbs, not his strings.

## The text

Both are given LayerBench's English news sample (`apps/web/public/corpora/en-general/sample.txt`,
Leipzig news 2023, CC BY 4.0) as LayerBench types it with its default settings: letters only, case
folded, the whole text (the app's 1M-symbol sample is larger than its 831,614 symbols). The capture
pastes that text, built by `apps/web/e2e/cyanophage/text.ts`, into his corpus popup, which takes
pasted text of at least 1,000 characters. His own word list has no licence and is never used.

Pasting the raw sample instead gives numbers that differ at the second decimal (Qwerty: skipgrams
5.41 against 5.39, LSB 4.65 against 4.64, Effort 1251.10 against 1254.51), because the two read text
differently: his popup lowercases, splits on whitespace, drops every word with a digit in it, keeps
every other character, curly quotes included, and turns some accented letters into plain ones;
LayerBench turns curly quotes into `'`, drops `“”`, turns dashes into `-` and removes digits but not
the word around them. On the text LayerBench types, his popup changes nothing but those accented
letters, `ä å á à â ö ó í ü é è ç æ ß ğ` (67 in the sample): LayerBench cannot type them on these
layouts and he would type a plain letter, so each is pasted as `#`, which his page also cannot type.

## What was reconciled

- **Keystrokes count what the layout cannot type.** His keystrokes (`m_input_length`) are every
  character of every word plus one for the space after it, whether his layout has a key for it or
  not; a character it lacks is skipped, costs nothing and ends the pair it was in. The cyanophage-like
  rules now count the same (`untyped_in_keystrokes`), in the pair rules' percentages and in Effort's
  divisor. On the sample that is 303 `?` and `!` and about 70 accented letters. How such a character
  breaks what is around it still differs, a known and measured difference:
  - LayerBench ends the word there, so it starts no pair, skipgram or trigram across it. His page
    ends the bigram but keeps the finger typed before it for the skipgram and the trigram after it:
    on `'q#ea '` three hundred times his page prints Skip Bigrams 19.99%, three hundred skipgrams
    LayerBench does not count.
  - Ending the word there, LayerBench counts two words and so two of the spaces the pair rules add
    per word (`caf#s`), where he counts one; and a text that ends in a space gives his popup one more,
    empty, word and keystroke.

  On the pinned text these move a number by about 0.0005 points, so every one of them reads the
  same to his two decimals; on another text a number near a rounding edge could read 0.01 apart.
  Effort divides by the text's own spaces and is not touched by the word count.
- **Scissors are keys in adjacent columns.** His scissors are two keys of one hand, in adjacent
  columns, two rows apart, typed by two fingers. The rule set counted adjacent fingers, which takes
  an index finger's stretch column with the middle finger's, two columns apart (Qwerty's `ct`):
  Qwerty read 4.09 against his 1.46. The rule set now counts adjacent columns.
- **Weak redirects need three different fingers**, as his do: the rule set's `weak_redirect` was the
  catalog's, which also takes a redirect whose first and last keys share a finger (Qwerty's `esd`).
- **Repeats** are left out of SFB in both; **case** is folded in both.
- **Thumbs** cost 1 in LayerBench's Effort and nothing in his: the layouts compared have no letter
  on a thumb.
- **Effort** after pasting is drawn by his board, which the corpus popup does not redraw, so the
  capture draws it again. Without that his page keeps the number for his own word list (Qwerty
  1258.15).

Two numbers in the docs were his on his own word list, not on this text: Qwerty SFB 4.38% and Effort
1258.15. On the sample his page prints Qwerty 4.52% and 1254.51, and so does LayerBench.

## Running it

The e2e needs a browser and is not run by CI. `E2E_PORT` picks a port no other checkout's dev
server holds:

```bash
E2E_CYANOPHAGE=1 E2E_PORT=4021 pnpm --filter @layerbench/web e2e --project=cyanophage
```

Name the spec file: Playwright matches its filter against the whole path, so a bare `cyanophage` runs every spec in a checkout whose folder name has the word in it. `E2E_CHANNEL=msedge` runs it on an installed Edge, where Playwright's own Chromium is not downloaded. Each layout types the whole text in the app, about
half a minute.

## Reading his page again

When his page or LayerBench's text changes (the e2e fails first on the text's hash and says so), read
his page again; it needs the network:

```bash
CYANOPHAGE_CAPTURE=1 E2E_PORT=4021 pnpm --filter @layerbench/web e2e --project=cyanophage
```

It rewrites `fixture.json` with the date, his script's hash and every number. Commit it only after
reading the diff: a number that moved is either his change or ours, and the PR says which.

The pinned fixture was first read in a browser with the capture's own `measure`
(`cyanophage/playground.ts`) on his page's HTML and script, served from LayerBench's dev server so
it could fetch the text. The capture test then ran end to end on his live page (2026-11-10, Edge)
and wrote the same `fixture.json`, byte for byte: all seventy numbers, his script's hash and the
text's.
