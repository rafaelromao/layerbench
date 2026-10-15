# LayerBench

A keyboard layout analyzer that types a text on a ZMK keymap and measures the presses. The metrics
themselves are defined in the [metric glossary](docs/METRICS.md); this one names what the app works
with.

## Language

**Analysis settings**:
What a layout is analyzed on: the text, how it is read (case and which characters count), the sample
taken from it, the features the layout is typed without, the rule set, and whether space is counted.
Every view that shows a layout's numbers analyzes it on its analysis settings, and the same settings
give the same numbers wherever they are used.
_Avoid_: request, request options, scoring options

**Binding**:
What a key does on one layer, or a combo does when its keys are pressed together: types a symbol,
reaches a layer, holds a modifier, or is a bigger key made of parts.
_Avoid_: action, mapping, keycode

**Copy up**:
Sending GitHub the saved documents this browser holds that GitHub lacks, or holds an older copy of.
Where both hold a document, GitHub's copy is the one opened.
_Avoid_: sync, push, upload

**Draft**:
A layout's unsaved edits, carried whole in its link after the `#`. The tab that made a draft knows
which saved layout its edits were made on, so saving it saves that layout; anywhere else it is a
layout of its own.
_Avoid_: unsaved copy, working copy

**Edit**:
One change an author makes to a layout, taken whole: keys bound, swapped or sent to another layer; a
layer added, removed or moved; a combo added; the behaviours replaced. It either lands, leaving a
layout that can still be drawn, or is refused with its reason and leaves the layout as it was; one
with nothing to change changes nothing. Undo takes back one edit that landed at a time.
_Avoid_: action, operation, op, mutation

**Kind of key**:
A sort of binding as the editor offers it. One kind can stand for several bindings that differ only
in how they act, as Layer stands for momentary, one-shot, toggle, to-layer and auto. It is not the key
kind a rule matches (`key_kind`), which is what a press counts as in the analysis.
_Avoid_: binding kind, key type

**Layout session**:
The layout open in Analyze, from the moment it is opened until another is: which saved layout it is,
if any, its draft, and the link that carries it. Its own changes to the link never open it again;
any other link does, even one naming the same layout.
_Avoid_: open layout, editor state

**Mix**:
A text made of two corpora, sentence by sentence, each in its share.
_Avoid_: blend, combined corpus

**Part**:
A binding inside a bigger key: the tap and the hold of a tap-hold, an adaptive key's default and what
each of its branches types, a tap dance's binding for each number of taps, a morph's plain and
changed binding. It is not a key's part of a number, which is what the key adds to a number that
adds up over keys.
_Avoid_: arm, sub-binding

**Press**:
One key, or one combo, pressed on a layer while typing a text, with what it did: the symbols it typed,
the modifier it held, or the layer it reached. Presses alike in all of that are the same press, however
often they happen.
_Avoid_: logical key, event, keystroke record

**Press log**:
Everything typing a text on a layout pressed: each press, how often it came, and which presses came
together within a word. Every number about the layout is read from it.
_Avoid_: simulation tables, registry, typing record

**Saved document**:
A layout, rule set or text the user saved, kept in this browser and, once they sign in, on GitHub
too, under an id that follows its name. A link names it by `saved:<id>`; where it is not saved it
does not open, and nothing opens in its place.
_Avoid_: stored document, saved item

**Saved layout**:
A saved document that is a layout. Besides `saved:<id>`, a link can name it by its id alone, or
carry it whole with its id inside, which opens as the saved layout wherever it is saved with the
same contents.
_Avoid_: stored layout, my layout

**Ranking**:
The Library's order of layouts by their numbers, on the analysis settings in its link with the sample
capped at 100,000 symbols.
_Avoid_: leaderboard, scores list
