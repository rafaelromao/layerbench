# Analyzing a layout

**Analyze** types a sample of text on the layout, key by key, and shows what that took: a heat map
of the keys, the numbers under it, and how any word you give it is typed.

Each group of the page, **Board**, **A word, typed**, **Summary**, **Legend**, **Editor** and
**Numbers**, folds away under its heading, and so do **Layouts** and **Metric comparison** in
**Compare**. This browser remembers which you folded.

Two numbers lead: **Effort**, how hard the keys are to reach, and **SFB**, how often one finger
presses two keys in a row. Lower is better for both. Some numbers, SFB among them but not Effort,
also carry a badge that places them among other layouts: green is good, red is poor.

## Effort and SFB

These are the two numbers every layout is shown and sorted by.

**Effort** is [cyanophage's](https://cyanophage.github.io/playground.html) measure. Each key
position has a cost, from 0 under the index, middle and ring fingers on the home row to 8 in the
inner bottom corners. Effort is the average cost of a keystroke, multiplied by 577 as cyanophage's
playground does, so a layout scores the same here as there on the same text, as long as it leaves
its thumbs to the space bar. A thumb press costs 1 here, where cyanophage charges nothing: a
one-shot tap, a thumb held for a layer and a letter on a thumb are presses too. A space counts as
a keystroke that costs nothing.

**SFB**, same finger bigrams, is the share of consecutive key pairs that one finger presses on two
different keys. It is the first measure of the
[Keyboard Layouts Doc](https://docs.google.com/document/d/1W0jhfqJI2ueJ2FNseR4YAFpNfsUM-_FlREHbpNGmC2o),
§4.1. Pressing the same key twice is a repeat, not an SFB.

### Sorting and comparing

**Library**, where the site opens, sorts every layout by Effort, by SFB or by name, and shows both
numbers on each card, all scored on the same sample of the same text. **Rank and filter** holds
what the ranking is made with, and **Boards**, which lists only the layouts on the boards you tick, so you can keep to the keyboards you own; the layouts on the others are not scored at
all. The layouts you saved are
ranked in the same list as the ones that come with the app, marked *saved*; untick **Saved
layouts**, in **Rank and filter**, to leave them out. Each layout takes its
place as its score arrives. This browser remembers the scores, the sort and what you chose to list, so the next
visit opens already ranked; the scores are checked again quietly, and a layout moves only if its
numbers changed. **Compare** puts every number for two layouts side by side, with the difference and which
of the two does better. Each layout's board has its own layer tabs, to look through every layer of
both, warm by what is pressed on the layer shown.

Layouts are compared on the text, not on their presses. SFB and the other pair rules are a share of
the letter pairs the text has, and Effort is per character typed, so a layout's layer taps, holds
and one-shots, which can never be a same-finger letter pair, do not make it look better than it
types: each adds its cost to Effort but no keystroke. A layout typing each character with one press
gets the same numbers either way. A thumb press is never part of a roll or an alternation either,
so a tap between two letters does not pass for a good trigram.

A layout that has no key for letters the text's language needs skips them, and skipping is free.
Each card says what share of the text it skips, and on a Portuguese text, say, the layouts that
cannot type `ã` or `ç` are ranked after the ones that can. Every layout that comes with the app types
them, through its [Dead keys](editing.md#default-layers) layer or, on Magic Romak and Romak, its
own accents; a layout of your own without them is the one ranked after. A layout is also held to the languages
it is for, chosen in **Settings** in **Analyze**: one for Spanish that has no `ñ` says so on its
card, whatever the text. It is only flagged for that, not ranked after the others: on an English
text it skipped nothing for Spanish.

**Rank with** switches special features off for the ranking: adaptive keys (they type their default
letter), the repeat key (doubled letters are tapped twice), typing combos, and macros that type two
letters or more, such as `qu` or `ão`. A macro typing one letter, like Magic Romak's accents, is how
the layout reaches that letter, and stays. What a feature typed is typed another way, or skipped if
there is none. **Analyze** on a card opens the layout ranked the same way, and says so.

The same switches are in every view that analyzes, in its **Settings**. **Compare with**, in
**Compare**, types and draws both layouts without the features left unticked, and **Analyze A** and
**Analyze B** open either one typed the same way. **Analyze with**, in **Analyze**, does it for the
one layout, which is still edited as written: only its numbers leave the features out.

### Changing the costs

The cost of each key is a parameter of the Effort rule, `params.effort`, changed in a rule set's
**JSON** in **Rules**: **Export current**, edit the costs, then **Import (replace current)** and save
the set. The change applies wherever that rule set is used. A thumb is a key like the others there:
give it a cost by its key, `L0` or `R1`, and that replaces the 1 every thumb press costs.

## How a text is typed

LayerBench does not look letters up in a table. It works out the physical presses that produce
each character on this keymap (the layer key first, the shift, the combo, the adaptive key) and
measures those presses. A letter on a layer costs its layer key too, and a one-shot that is used up
by the wrong key counts as wasted.

When a character can be typed more than one way, it takes the fewest presses, then the way that
leaves no layer key held, then the one that makes the fewest same-finger pairs with the keys before
it in the word, then the one with less effort on cyanophage's grid, where a thumb is free, so what
is typed never depends on what a thumb costs. When several keys reach a layer the same way, each
word is typed with the one that makes it the fewest same-finger pairs, so the key tapped for a
layer can change from word to word, as **How is this typed?** shows.

Type a word into **How is this typed?** and the board plays it: each press lights up in turn, on
the layer it lands on, and a thumb held for a layer stays marked while it is held. The ring on a
layer's reach keys, the keys held or tapped to get to it, stays all along. The presses are
listed under the field; tap one to stop on it, and **Play** to start again. Characters the layout
cannot type at all are listed in red above the numbers. Each one breaks the word it is in, so a
long list means the numbers understate the cost.

### Heat

**Heat** colours each key by its part of the work: how often it is pressed (**Usage**), its part of
the same-finger pairs (**SFB contribution**), of **Effort** or of **Finger travel**, or how often it
is tapped to reach a layer (**Layer taps**). A key's part is the same number [its own
numbers](#a-keys-numbers) give: a pair counts half on each of its keys, Effort is a key's cost times
its presses, so the free home-row keys and the space bar stay cold, and travel counts on the key a
finger moved to. Each layer counts only what was pressed on it, on the key that typed it. The thumb tapped
for Alpha 2 is warm on the layer it is tapped on, not on Alpha 2. A key that lets the layer below
show through is warm on that layer, where the key that types is drawn.

### Combos

Combos marked for typing are drawn as small pills between the keys pressed together, on the layers
where they work, and a pill lights up with its keys when a word uses it. **Combos**, under *On the
board* in **Settings**, hides them. Combos marked as commands are shortcuts the analysis never presses, so they
are not drawn.

### Case and space

By default capitals count as lower case and the space key is left out of the counts, as the
Keyboard Layouts Doc does. **Shift** types capitals through the layout's shift key instead, and
**Space** keeps the space key in. Both are among the feature switches, in **Settings**. **Counts**
says what of the text is counted: letters only, the default, or numbers and symbols as well. The
symbols are those a symbol layer carries and those the bundled texts use. Curly quotes, dashes and
the ellipsis count as their plain forms, and a language's own punctuation, Spanish `¿ ¡` say, is
kept in any count.

### The text itself

**Corpus** lists the texts that come with the app, by language, each with where it came from. Your
own text can be pasted or uploaded there and analyzed like any other, and **Save to library** keeps
it: saved texts are listed in **Corpus** and offered in every view that analyzes, after the ones that
come with the app. A text published under an open licence can join the ones that come with the
app, by pull request on GitHub; the [README](../../README.md#bundled-corpora) lists the steps. **Sample**, on **Analyze**
and **Compare**, sets how much of the text is typed, 100,000 symbols unless you choose more: more
gives steadier numbers, less gives them sooner, which matters most while a layout is being edited,
since every edit types it again. **Library** ranks on at most 100,000 symbols, since it types the
text once for every layout, and says so above the list.

### The same choices in every view

**Library**, **Analyze** and **Compare** share their choices: the corpus, the rules,
what counts, the feature switches, space and shift. Change one in any of them and the menu carries
it to the others, and so do **Rules** and **Corpus** when they open **Analyze** with a set or a
text. A link still opens exactly what it names, and a new visit starts from its link.

## A key's numbers

Select a key and, under its name, it shows what it adds to the analysis on the layer shown:

- its share of the presses, and how many were made to reach a layer;
- its part of each number that adds up over keys, with that number and the share it makes of it.
  A pair counts half on each of its keys, a combo's share is split between the keys pressed
  together, Effort is the key's cost times its presses and Finger travel the distance its finger
  moved to press it, so the parts of every key add up to the number. The headline numbers come
  first; **Every number** shows the rest. Balances, ratios and word lists have no part per key;
- tap a number to list the pairs and trigrams it counts with the key in them, and tap one of those
  to outline it on the board;
- for a key that reaches a layer, what it was **pressed for**: the keys pressed right after it,
  each with its share, and on the board of the layer it reaches.

The parts follow an edit at once, an estimate after a swap included; the lists come a moment later.

## Every other number

Below the summary, the numbers are grouped by what they count:

| Group | What it counts |
|---|---|
| Bigrams | two presses in a row: same finger, scissors, lateral stretches |
| Skipgrams | two presses with one or more between them |
| Trigrams | three presses: alternation, rolls, redirects |
| Usage | how the work is shared between fingers, hands, rows and columns |
| Effort | Effort, and the words that take the most of it |
| Layers | layer taps, one-shots, macros, combos and adaptive keys: what layers cost |

The **Show** checkboxes above the groups hide the ones you do not need, and **All** shows or hides
every one at once. The choice holds in **Analyze** and **Compare** alike, and this browser remembers
it.

A card's breakdown lists the key pairs or words behind its number. Selecting one outlines its keys
on the board, with a green arrow from each key to the next, and turns the board to the layer they
are pressed on: `→A2ã`, the thumb for Alpha 2
and then `ã`, shows Alpha 2. A layer key is named as on the board, `→A2` for the key tapped for
Alpha 2 and `⇩Symb` for one held for Symbols. A pair that ends on one, such as `a→A2`, is
underlined with dots, and selecting it also opens what that key was pressed for: the board of the
layer it reaches, each key warm by its part of the pair, and the same as a list. Click a card
anywhere else, or its `⤢`, to see it larger. The [metric glossary](../METRICS.md) defines every
number.

### What the badges mean

The Keyboard Layouts Doc sorts layouts into bands for the metrics it covers, from *min* to *max*,
and LayerBench adds its own for layer taps, wasted one-shots and extra keys. A badge names the band
a number falls in, and its colour says whether that is good for that metric. For most metrics lower
is better; for alternation, rolls and the in:out roll ratio, higher is. The
[glossary](../METRICS.md#bands) lists every band.

## Rules and their sources

Every number is a rule: plain data that says which key sequences count, and how. **Rules** lists
them. Each can be turned off, given other bands and a score weight, or removed, and new ones can
be composed; anything else, such as a key's cost, is changed in the set's **JSON**. A rule set is
saved like a layout, but its link only names it, so it opens only where it is saved.

Every built-in rule names where its definition comes from: a section of the Keyboard Layouts Doc,
a line of another analyzer's code, or the glossary where the rule is LayerBench's own. Open
**Sources** under a rule in **Rules**, or on its card in **Analyze**.

### Presets

A preset is a rule set that follows another analyzer's definitions: *Layouts Doc* (the default),
*cyanophage-like* and *Keysolve-like*. The [glossary](../METRICS.md#presets) says what each one
changes.

### Writing a rule

The **Composer**, near the bottom of **Rules**, above **JSON**, builds a rule from conditions on a sequence of
presses (same finger, rows apart, a thumb among them) and a way to count them. The whole vocabulary
is in the [glossary](../METRICS.md#rule-vocabulary).
