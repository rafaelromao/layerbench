# LayerBench

A keyboard layout analyzer that types a text on a ZMK keymap and measures the presses. The metrics
themselves are defined in the [metric glossary](docs/METRICS.md); this one names what the app works
with.

## Language

**Alpha layer**:
A layer on which at least one key types a letter from a to z by itself, not as part of a macro. Most
layouts have one; a second makes a layout Special.
_Avoid_: letter layer, alphas

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

**Category**:
Where the Library files a layout so that it is ranked against its peers: Standard, Thumb Alpha or
Special. It follows from the layout's own keys, whoever made it, and nothing on its default layers
counts toward it. Custom and community are where a layout came from, not categories.
_Avoid_: family, type, group, class

**Community layout**:
A layout someone submitted and the maintainer accepted. The Library lists it beside the bundled
layouts, marked as from the community, as it was submitted and in the category its keys give it.
_Avoid_: contributed layout, user layout

**Copy up**:
Sending GitHub the custom documents this browser holds that GitHub lacks, or holds an older copy of.
Where both hold a document, GitHub's copy is the one opened.
_Avoid_: sync, push, upload

**Custom document**:
A layout, rule set or text the user keeps, saved in this browser and, once they sign in, on GitHub
too, under an id that follows its name. A link names it by `custom:<id>`; where it is not saved it
does not open, and nothing opens in its place. Links once named it `saved:<id>`, and those no longer
open.
_Avoid_: saved document, stored document, saved item

**Custom layout**:
A custom document that is a layout. Besides `custom:<id>`, a link can name it by its id alone, or
carry it whole with its id inside, which opens as the custom layout wherever it is saved with the
same contents.
_Avoid_: saved layout, stored layout, my layout

**Default layers**:
The layers every bundled layout but Magic Romak has besides its own, so that each can type every
letter and symbol (Magic Romak keeps its keymap's Numbers and Symbols and nothing more):
Accents, Numbers and Symbols, and Extras for whatever those cannot hold. Accents holds the dead keys,
and the letters and accented letters the supported languages need; Extras comes on while Numbers and
Symbols are both held. Every bundled layout holds Numbers on its left inner thumb and Symbols on its
right inner one, so Extras is both inner thumbs, in either order. A Standard or Thumb Alpha layout
taps its right outer thumb for Accents; a Special one presses a combo.
_Avoid_: standard layers, common layers, shared layers

**Draft**:
A layout's unsaved edits, carried whole in its link after the `#`. The tab that made a draft knows
which custom layout its edits were made on, so saving it saves that layout; anywhere else it is a
layout of its own.
_Avoid_: unsaved copy, working copy

**Edit**:
One change an author makes to a layout, taken whole: keys bound, swapped or sent to another layer; a
layer added, removed or moved; a combo added or changed; the behaviours replaced. It either lands,
leaving a layout that can still be drawn, or is refused with its reason and leaves the layout as it
was; one with nothing to change changes nothing. Undo takes back one edit that landed at a time.
_Avoid_: action, operation, op, mutation

**Home row mods**:
Modifiers held on the home row's finger keys, each key still typing what it typed when tapped. Every
bundled layout but Magic Romak has Gui, Ctrl, Alt and Shift from the left pinky in, mirrored on the
right, on its base layer.
_Avoid_: HRM, home-row modifiers (in code)

**Kind of key**:
A sort of binding as the editor offers it. One kind can stand for several bindings that differ only
in how they act, as Layer stands for momentary, one-shot, toggle, to-layer and auto. It is not the key
kind a rule matches (`key_kind`), which is what a press counts as in the analysis.
_Avoid_: binding kind, key type

**Layout session**:
The layout open in Analyze, from the moment it is opened until another is: which custom layout it is,
if any, its draft, and the link that carries it. Its own changes to the link never open it again;
any other link does, even one naming the same layout.
_Avoid_: open layout, editor state

**Layout's link**:
Where a layout comes from: its author's keymap, firmware or page, as one http or https URL, set in
Settings as **Link**. Optional everywhere, a bundled, community or submitted layout included. It is
not the link that carries a layout in the app, which names it or holds it after the `#`.
_Avoid_: source, source link (in the format)

**Main thumbs**:
The two innermost thumb keys of each hand. On a bundled Standard or Thumb Alpha layout, holding them
gives, from left to right, Shift, Numbers, Symbols and Shift.
_Avoid_: thumb cluster, home thumbs

**Mix**:
A text made of two corpora, sentence by sentence, each in its share.
_Avoid_: blend, combined corpus

**Part**:
A binding inside a bigger key: the tap and the hold of a tap-hold, an adaptive key's default and what
each of its branches types, a tap dance's binding for each number of taps, a morph's plain and
changed binding. It is not a key's part of a number, which is what the key adds to a number that
adds up over keys.
_Avoid_: arm, sub-binding

**Plain part**:
The part a key amounts to when nothing chooses another: a tap-hold's tap, a layer-tap's tap, a
morph's plain binding, a tap dance's first tap, an adaptive key's default. What the board draws on a
key, and what the editor keeps when a key changes kind, are read from it.
_Avoid_: resting part, default, base binding

**Press**:
One key, or one combo, pressed on a layer while typing a text, with what it did: the symbols it typed,
the modifier it held, or the layer it reached. Presses alike in all of that are the same press, however
often they happen.
_Avoid_: logical key, event, keystroke record

**Press log**:
Everything typing a text on a layout pressed: each press, how often it came, and which presses came
together within a word. Every number about the layout is read from it.
_Avoid_: simulation tables, registry, typing record

**Ranking**:
The Library's order of layouts by their numbers, on the analysis settings in its link with the sample
capped at 100,000 symbols.
_Avoid_: leaderboard, scores list

**Special feature**:
Something a layout's keys do beyond typing, reaching a layer or holding a modifier: an adaptive key, a
macro, an alt repeat, a mod morph, or a named behaviour of the layout's own.
_Avoid_: magic, advanced key, extra feature

**Special layout**:
A layout with a special feature, more than one alpha layer, or a board of fewer than 34 keys. A
bundled one keeps its author's design, with the default layers added, or for Magic Romak its
keymap's Numbers and Symbols alone, and may bend any rule the other categories follow.
_Avoid_: exotic layout, advanced layout

**Standard layout**:
A layout that is neither Special nor Thumb Alpha: no special feature, no thumb alpha, at most one
alpha layer, on a board of 34 keys or more. The bundled ones share their default layers and main
thumbs, so they differ in little but their letters.
_Avoid_: regular layout, classic layout, normal layout

**Submit**:
Proposing a custom layout as a community layout: it goes to the maintainer for review, and joins the
Library once accepted.
_Avoid_: publish, contribute, share

**Thumb alpha**:
A letter from a to z that a thumb key types on an alpha layer.
_Avoid_: thumb letter

**Thumb Alpha layout**:
A layout like a Standard one, but with at least one thumb alpha.
_Avoid_: thumb-letter layout
