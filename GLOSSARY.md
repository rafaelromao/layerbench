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

**Draft**:
A layout's unsaved edits, carried whole in its link after the `#`. The tab that made a draft knows
which saved layout it is an edit of, so saving it saves that layout; anywhere else it is a layout of
its own.
_Avoid_: unsaved copy, working copy

**Layout session**:
The layout open in Analyze, from the moment it is opened until another is: which saved layout it is,
if any, its draft, and the link that carries it. Its own changes to the link never open it again;
any other link does, even one naming the same layout.
_Avoid_: open layout, editor state

**Mix**:
A text made of two corpora, sentence by sentence, each in its share.
_Avoid_: blend, combined corpus

**Saved layout**:
A layout kept in the browser or the user's GitHub storage, under an id that follows its name. A link
can name it by its id (`saved:<id>`, or the id alone), or carry it whole with its id inside, which
opens as the saved layout wherever it is saved with the same contents.
_Avoid_: stored layout, my layout

**Ranking**:
The Library's order of layouts by their numbers, on the analysis settings in its link with the sample
capped at 100,000 symbols.
_Avoid_: leaderboard, scores list
