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

**Mix**:
A text made of two corpora, sentence by sentence, each in its share.
_Avoid_: blend, combined corpus

**Ranking**:
The Library's order of layouts by their numbers, on the analysis settings in its link with the sample
capped at 100,000 symbols.
_Avoid_: leaderboard, scores list
