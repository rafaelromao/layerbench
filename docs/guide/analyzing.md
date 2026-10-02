# Analyzing a layout

**Analyze** types a sample of text on the layout, key by key, and shows what that took: a heat map
of the keys, the numbers under it, and how any word you give it is typed.

Two numbers lead: **Effort**, how hard the keys are to reach, and **SFB**, how often one finger
presses two keys in a row. Lower is better for both. Most numbers also carry a badge that places
them among other layouts: green is good, red is poor.

## Effort and SFB

These are the two numbers every layout is shown and sorted by.

**Effort** is [cyanophage's](https://cyanophage.github.io/playground.html) measure. Each key
position has a cost, from 0 under the index, middle and ring fingers on the home row to 8 in the
inner bottom corners. Effort is the average cost of a keystroke, multiplied by 577 as cyanophage's
playground does, so a layout scores the same here as there on the same text. Thumb keys cost
nothing, and a space counts as a keystroke that costs nothing.

**SFB**, same finger bigrams, is the share of consecutive key pairs that one finger presses on two
different keys. It is the first measure of the
[Keyboard Layouts Doc](https://docs.google.com/document/d/1W0jhfqJI2ueJ2FNseR4YAFpNfsUM-_FlREHbpNGmC2o),
§4.1. Pressing the same key twice is a repeat, not an SFB.

### Sorting and comparing

**Library**, where the site opens, sorts every layout by Effort, by SFB or by name, and shows both
numbers on each card, all scored on the same sample of the same text. The layouts you saved are
ranked in the same list as the ones that come with the app, marked *saved*. Each layout takes its
place as its score arrives. **Compare** puts every number for two layouts side by side, with the difference and which
of the two does better.

Layouts are compared on the text, not on their presses. SFB and the other pair rules are a share of
the letter pairs the text has, and Effort is per character typed, so a layout's layer taps, holds
and one-shots, which cost nothing on a thumb and can never be a same-finger letter pair, do not make
it look better than it types. A layout typing each character with one press gets the same numbers
either way.

A layout that has no key for letters the text's language needs skips them, and skipping is free.
Each card says what share of the text it skips, and on a Portuguese text, say, the layouts that
cannot type `ã` or `ç` are ranked after the ones that can.

**Rank with** switches special features off for the ranking: magic keys (they type their default
letter), the repeat key (doubled letters are tapped twice), typing combos, and macros that type two
letters or more, such as `qu` or `ão`. A macro typing one letter, like Magic Romak's accents, is how
the layout reaches that letter, and stays. What a feature typed is typed another way, or skipped if
there is none. **Analyze** on a card opens the layout ranked the same way, and says so, and **Edit**
works its numbers out the same way.

The same switches are in every view that analyzes. **Compare with**, in **Compare**, types and
draws both layouts without the features left unticked, and **Analyze A** opens A typed the same
way. **Analyze with**, in **Analyze** and in the editor, does it for the one layout. The editor
still edits every key as written: only its numbers leave the features out.

### Changing the costs

The cost of each key is a parameter of the Effort rule. **Rules** can give any key another cost,
and the change applies wherever that rule set is used.

## How a text is typed

LayoutMaster does not look letters up in a table. It works out the physical presses that produce
each character on this keymap (the layer key first, the shift, the combo, the magic key) and
measures those presses. A letter on a layer costs its layer key too, and a one-shot that is used up
by the wrong key counts as wasted.

Type a word into **How is this typed?** and the board plays it: each press lights up in turn, on
the layer it lands on, and a thumb held for a layer stays marked while it is held. The ring on a
layer's reach keys, the keys held or tapped to get to it, stays all along. The presses are
listed under the field; tap one to stop on it, and **Play** to start again. Characters the layout
cannot type at all are listed in red above the numbers. Each one breaks the word it is in, so a
long list means the numbers understate the cost.

### Heat

**Heat** colours each key by its part of the work: how often it is pressed (**Usage**), its share of
same-finger pairs (**SFB contribution**), of **Effort** or of **Finger travel**, or how often it is
tapped to reach a layer (**Layer taps**). Each layer counts only what was pressed on it, on the key
that typed it. The thumb tapped for Alpha 2 is warm on the layer it is tapped on, not on Alpha 2. A
key that lets the layer below show through is warm on that layer, where the key that types is
drawn.

### Combos

Combos marked for typing are drawn as small pills between the keys pressed together, on the layers
where they work, and a pill lights up with its keys when a word uses it. **Combos**, beside
**Heat**, hides them. Combos marked as commands are shortcuts the analysis never presses, so they
are not drawn.

### Case and space

By default capitals count as lower case and the space key is left out of the counts, as the
Keyboard Layouts Doc does. **Model shift** types capitals through the layout's shift key instead,
and **Include space** keeps the space key in. Both sit beside the feature switches. **Counts** says
what of the text is counted: letters only, the default, or numbers and symbols as well.

### The text itself

**Corpus** lists the texts that come with the app, by language, each with where it came from. Your
own text can be pasted or uploaded there and analyzed like any other. **Sample**, on **Analyze**
and **Compare**, sets how much of the text is typed: more gives steadier numbers, less gives them
sooner. The Library and the editor type a quick 100,000 symbols at most.

### The same choices in every view

**Library**, **Analyze**, **Compare** and the editor share their choices: the corpus, the rules,
what counts, the feature switches, space and shift. Change one in any of them and the menu carries
it to the others, and so do **Rules** and **Corpus** when they open **Analyze** with a set or a
text. A link still opens exactly what it names, and a new visit starts from its link.

## Every other number

Below the summary, the numbers are grouped by what they count:

| Group | What it counts |
|---|---|
| Bigrams | two presses in a row: same finger, scissors, lateral stretches |
| Skipgrams | two presses with one or more between them |
| Trigrams | three presses: alternation, rolls, redirects |
| Usage | how the work is shared between fingers, hands, rows and columns |
| Effort | Effort, and the words that take the most of it |
| Layers | layer taps, one-shots, macros, combos and magic keys: what layers cost |

A card's breakdown lists the key pairs or words behind its number. Selecting one outlines its keys
on the board and turns the board to the layer they are pressed on: `→A2ã`, the thumb for Alpha 2
and then `ã`, shows Alpha 2. A layer key is named as on the board, `→A2` for the key tapped for
Alpha 2 and `⇩Symb` for one held for Symbols. A pair that ends on one, such as `a→A2`, is
underlined with dots, and selecting it also opens what that key was pressed for: the board of the
layer it reaches, each key warm by its part of the pair, and the same as a list. Click a card
anywhere else, or its `⤢`, to see it larger. The [metric glossary](../METRICS.md) defines every
number.

### What the badges mean

The Keyboard Layouts Doc sorts layouts into bands for each metric, from *min* to *max*. A badge
names the band a number falls in, and its colour says whether that is good for that metric. For
most metrics lower is better; for alternation and rolls, higher is. The
[glossary](../METRICS.md#bands) lists every band.

## Rules and their sources

Every number is a rule: plain data that says which key sequences count, and how. **Rules** lists
them. Each can be turned off, given other parameters, copied or removed, and new ones can be
composed. A rule set is saved and shared like a layout.

Every built-in rule names where its definition comes from: a section of the Keyboard Layouts Doc,
a line of another analyzer's code, or the glossary where the rule is LayoutMaster's own. Open
**Sources** under a rule in **Rules**, or on its card in **Analyze**.

### Presets

A preset is a rule set that follows another analyzer's definitions: *Layouts Doc* (the default),
*cyanophage-like* and *Keysolve-like*. The [glossary](../METRICS.md#presets) says what each one
changes.

### Writing a rule

The **Composer**, at the bottom of **Rules**, builds a rule from conditions on a sequence of
presses (same finger, rows apart, a thumb among them) and a way to count them. The whole vocabulary
is in the [glossary](../METRICS.md#rule-vocabulary).
